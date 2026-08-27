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

function createAudioContext(): AudioContext {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("Web Audio API unavailable");
  return new AC();
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxBus: BiquadFilterNode | null = null;
  private readonly buffers = new Map<SfxId, AudioBuffer>();
  /** Raw file bytes fetched before the AudioContext exists (Safari-safe preload). */
  private readonly pending = new Map<SfxId, ArrayBuffer>();
  private readonly voices = new Map<SfxId, PlayingVoice[]>();
  private mixer = loadMixer();
  private loadPromise: Promise<void> | null = null;
  private unlockPromise: Promise<void> | null = null;
  private unlocked = false;
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

  /**
   * Must run inside a user-gesture call stack on Safari/iOS.
   * Creates/resumes the AudioContext, primes it, starts music ASAP, then fills SFX.
   */
  async unlock(): Promise<void> {
    // Do sync gesture work before any await — Safari only unlocks in this stack.
    const context = this.ensureContext();
    this.primeContext(context);
    if (context.state !== "running") {
      void context.resume().catch(() => undefined);
    }

    if (this.unlockPromise) return this.unlockPromise;
    this.unlockPromise = this.unlockInner();
    try {
      await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  play(id: SfxId, options?: { volume?: number; rate?: number; loop?: boolean }): void {
    if (options?.loop && this.isPlaying(id)) return;
    // Charge cue must never stack — overlapping plays caused the old throw glitch.
    if (id === "slapCharge" && this.isPlaying(id)) return;

    const context = this.context;
    // Safari: voices started while suspended never become audible.
    if (!this.unlocked || !context || context.state !== "running") {
      void this.unlock().then(() => {
        if (!this.unlocked || this.context?.state !== "running") return;
        // Music is started by unlock itself; only retry other voices.
        if (id === "music") return;
        this.play(id, options);
      });
      return;
    }

    const buffer = this.buffers.get(id);
    const musicGain = this.musicGain;
    const sfxGain = this.sfxGain;
    if (!buffer || !musicGain || !sfxGain) return;

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
    if (!this.mixer.musicEnabled) return;
    if (this.isPlaying("music")) return;
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

  private async unlockInner(): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== "running") {
      await context.resume().catch(() => undefined);
    }

    // Safari: don't wait for every SFX — get music decoded and playing first.
    await this.ensureDecoded("music");
    if (context.state !== "running") {
      await context.resume().catch(() => undefined);
    }
    this.unlocked = context.state === "running";
    this.applyMixer();
    if (this.unlocked) this.startMusic();

    // Remaining assets in the background.
    void this.load().then(async () => {
      await this.decodePending();
      if (this.unlocked && this.context?.state === "running" && !this.isPlaying("music")) {
        this.startMusic();
      }
    });
  }

  private async loadAll(): Promise<void> {
    // Prefetch bytes without creating an AudioContext — Safari blocks contexts
    // created outside a user gesture and may never produce sound after that.
    await Promise.all(
      SFX_IDS.map(async (id) => {
        if (this.buffers.has(id) || this.pending.has(id)) return;
        const data = await this.fetchBytes(SFX[id].file);
        if (data) this.pending.set(id, data);
      }),
    );
    if (this.context) await this.decodePending();
  }

  private async ensureDecoded(id: SfxId): Promise<void> {
    if (this.buffers.has(id)) return;
    let data = this.pending.get(id);
    if (!data) {
      const fetched = await this.fetchBytes(SFX[id].file);
      if (!fetched) return;
      data = fetched;
      this.pending.set(id, data);
    }
    const context = this.context;
    if (!context) return;
    try {
      // slice() — Safari/Chrome detach the buffer on decode.
      const buffer = await context.decodeAudioData(data.slice(0));
      this.buffers.set(id, buffer);
      this.pending.delete(id);
    } catch {
      // Leave pending for a later retry.
    }
  }

  private async decodePending(): Promise<void> {
    const context = this.context;
    if (!context) return;
    const entries = [...this.pending.entries()];
    await Promise.all(
      entries.map(async ([id, data]) => {
        try {
          const buffer = await context.decodeAudioData(data.slice(0));
          this.buffers.set(id, buffer);
          this.pending.delete(id);
        } catch {
          // Leave pending so a later unlock can retry if needed.
        }
      }),
    );
  }

  private async fetchBytes(file: string): Promise<ArrayBuffer | null> {
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
        return data;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Silent buffer start — keeps Safari AudioContext alive through the gesture. */
  private primeContext(context: AudioContext): void {
    try {
      const buffer = context.createBuffer(1, 1, context.sampleRate || 22050);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
    } catch {
      // Best-effort.
    }
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master && this.musicGain && this.sfxGain) return this.context;
    const context = createAudioContext();
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
    // iOS often re-suspends after backgrounding — drop looping music so unlock can restart it.
    context.addEventListener("statechange", () => {
      const running = context.state === "running";
      this.unlocked = running;
      if (!running) {
        const playing = this.voices.get("music");
        if (playing) {
          for (const { source } of playing) {
            try {
              source.stop();
            } catch {
              // Already stopped.
            }
          }
          this.voices.delete("music");
        }
      } else if (this.mixer.musicEnabled && !this.isPlaying("music")) {
        this.startMusic();
      }
    });
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
