import { AUDIO_STORAGE_KEY, MUTE_STORAGE_KEY, SFX, SFX_BASE_PATH, SFX_IDS, type SfxId } from "./sfx-catalog.js";
import { resolveAssetUrl } from "../config/runtime.js";

export type AudioBus = "music" | "sfx";

export interface MixerState {
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
}

interface PlayingVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function loadMixer(): MixerState {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MixerState>;
      return {
        musicVolume: clamp01(typeof parsed.musicVolume === "number" ? parsed.musicVolume : 1),
        sfxVolume: clamp01(typeof parsed.sfxVolume === "number" ? parsed.sfxVolume : 1),
        musicEnabled: parsed.musicEnabled !== false,
        sfxEnabled: parsed.sfxEnabled !== false,
      };
    }
  } catch {
    // Fall through to mute-key fallback.
  }
  const muted = localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  return {
    musicVolume: 1,
    sfxVolume: 1,
    musicEnabled: !muted,
    sfxEnabled: !muted,
  };
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxBus: BiquadFilterNode | null = null;
  private readonly buffers = new Map<SfxId, AudioBuffer>();
  private readonly voices = new Map<SfxId, PlayingVoice[]>();
  private mixer = loadMixer();
  private loadPromise: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  getMixer(): MixerState {
    return { ...this.mixer };
  }

  isMuted(): boolean {
    return !this.mixer.musicEnabled && !this.mixer.sfxEnabled;
  }

  isEnabled(bus: AudioBus): boolean {
    return bus === "music" ? this.mixer.musicEnabled : this.mixer.sfxEnabled;
  }

  getVolume(bus: AudioBus): number {
    return bus === "music" ? this.mixer.musicVolume : this.mixer.sfxVolume;
  }

  onMuteChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setVolume(bus: AudioBus, volume: number): void {
    const next = clamp01(volume);
    if (bus === "music") this.mixer.musicVolume = next;
    else this.mixer.sfxVolume = next;
    this.persist();
    this.applyMixer();
    this.notify();
  }

  setEnabled(bus: AudioBus, enabled: boolean): void {
    if (bus === "music") this.mixer.musicEnabled = enabled;
    else this.mixer.sfxEnabled = enabled;
    this.persist();
    this.applyMixer();
    this.notify();
    if (enabled) void this.unlock();
  }

  toggleEnabled(bus: AudioBus): boolean {
    const next = !this.isEnabled(bus);
    this.setEnabled(bus, next);
    return next;
  }

  setMuted(muted: boolean): void {
    this.mixer.musicEnabled = !muted;
    this.mixer.sfxEnabled = !muted;
    this.persist();
    this.applyMixer();
    this.notify();
    if (!muted) void this.unlock();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.isMuted());
    return this.isMuted();
  }

  async load(): Promise<void> {
    this.loadPromise ??= this.loadAll();
    await this.loadPromise;
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    this.startMusic();
  }

  play(id: SfxId, options?: { volume?: number; rate?: number; loop?: boolean }): void {
    if (options?.loop && this.isPlaying(id)) return;

    const buffer = this.buffers.get(id);
    const context = this.context;
    const musicGain = this.musicGain;
    const sfxGain = this.sfxGain;
    if (!buffer || !context || !musicGain || !sfxGain || context.state === "closed") return;

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = options?.loop ?? false;
    source.playbackRate.value = options?.rate ?? 1;
    const level = SFX[id].volume * (options?.volume ?? 1);
    if (options?.loop) {
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(level, context.currentTime + 0.06);
    } else {
      gain.gain.value = level;
    }
    const dest = id === "music" ? musicGain : (this.sfxBus ?? sfxGain);
    source.connect(gain).connect(dest);

    const voice = { source, gain };
    const playing = this.voices.get(id) ?? [];
    playing.push(voice);
    this.voices.set(id, playing);
    source.onended = () => {
      const remaining = (this.voices.get(id) ?? []).filter((entry) => entry !== voice);
      if (remaining.length > 0) this.voices.set(id, remaining);
      else this.voices.delete(id);
    };
    source.start();
  }

  playLoop(id: SfxId, options?: { volume?: number; rate?: number }): void {
    this.play(id, { ...options, loop: true });
  }

  isPlaying(id: SfxId): boolean {
    return (this.voices.get(id)?.length ?? 0) > 0;
  }

  startMusic(): void {
    this.playLoop("music");
  }

  stop(id: SfxId): void {
    const playing = this.voices.get(id);
    const context = this.context;
    if (!playing || !context) return;
    const now = context.currentTime;
    for (const { source, gain } of playing) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        source.stop(now + 0.05);
      } catch {
        // Already stopped.
      }
    }
    this.voices.delete(id);
  }

  private async loadAll(): Promise<void> {
    const context = this.ensureContext();
    await Promise.all(
      SFX_IDS.map(async (id) => {
        const buffer = await this.fetchBuffer(context, SFX[id].file);
        if (buffer) this.buffers.set(id, buffer);
      }),
    );
    if (this.context?.state === "running") this.startMusic();
  }

  private async fetchBuffer(context: AudioContext, file: string): Promise<AudioBuffer | null> {
    const swapped = file.includes("-") ? file.replaceAll("-", "_") : file.replaceAll("_", "-");
    const candidates = [file, swapped];
    if (file.endsWith(".wav")) {
      candidates.push(file.slice(0, -4) + ".mp3", swapped.slice(0, -4) + ".mp3");
    }
    if (file.endsWith(".mp3")) {
      candidates.push(file.slice(0, -4) + ".wav", swapped.slice(0, -4) + ".wav");
    }

    for (const candidate of candidates) {
      try {
        const response = await fetch(resolveAssetUrl(`${SFX_BASE_PATH}${candidate}`));
        if (!response.ok) continue;
        const data = await response.arrayBuffer();
        if (data.byteLength < 32) continue;
        return await context.decodeAudioData(data.slice(0));
      } catch {
        continue;
      }
    }
    return null;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master && this.musicGain && this.sfxGain) return this.context;
    const context = new AudioContext();
    const master = context.createGain();
    master.connect(context.destination);
    const musicGain = context.createGain();
    musicGain.connect(master);
    const sfxGain = context.createGain();
    sfxGain.connect(master);
    const sfxBus = context.createBiquadFilter();
    sfxBus.type = "lowpass";
    sfxBus.frequency.value = 2800;
    sfxBus.Q.value = 0.45;
    sfxBus.connect(sfxGain);
    this.context = context;
    this.master = master;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    this.sfxBus = sfxBus;
    this.applyMixer();
    return context;
  }

  private applyMixer(): void {
    if (!this.context || !this.musicGain || !this.sfxGain) return;
    const now = this.context.currentTime;
    this.musicGain.gain.setTargetAtTime(this.mixer.musicEnabled ? this.mixer.musicVolume : 0, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(this.mixer.sfxEnabled ? this.mixer.sfxVolume : 0, now, 0.04);
  }

  private persist(): void {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.mixer));
    localStorage.setItem(MUTE_STORAGE_KEY, this.isMuted() ? "1" : "0");
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const audio = new AudioManager();
