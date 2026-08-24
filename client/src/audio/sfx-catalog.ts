export const SFX_IDS = [
  "jump",
  "jumpAir",
  "land",
  "platformDrop",
  "slapCharge",
  "slapSwing",
  "slapHitLight",
  "slapHitHeavy",
  "hit",
  "ko",
  "respawn",
  "countdown",
  "fight",
  "uiSlap",
  "uiShatter",
  "run",
  "music",
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export interface SfxDefinition {
  /** Drop-in filename under /assets/sfx/. `.mp3` is also tried if `.wav` is missing. */
  file: string;
  volume: number;
}

export const SFX: Record<SfxId, SfxDefinition> = {
  jump: { file: "jump.wav", volume: 0.34 },
  jumpAir: { file: "jump-air.wav", volume: 0.28 },
  land: { file: "land.wav", volume: 0.3 },
  platformDrop: { file: "platform-drop.wav", volume: 0.2 },
  slapCharge: { file: "slap-charge.wav", volume: 0.22 },
  slapSwing: { file: "slap-swing.wav", volume: 0.32 },
  slapHitLight: { file: "slap-hit-light.wav", volume: 0.4 },
  slapHitHeavy: { file: "slap-hit-heavy.wav", volume: 0.48 },
  hit: { file: "hit.wav", volume: 0.36 },
  ko: { file: "ko.wav", volume: 0.42 },
  respawn: { file: "respawn.wav", volume: 0.3 },
  countdown: { file: "countdown.wav", volume: 0.28 },
  fight: { file: "fight.wav", volume: 0.34 },
  uiSlap: { file: "ui-slap.wav", volume: 0.38 },
  uiShatter: { file: "ui-shatter.wav", volume: 0.32 },
  run: { file: "run.wav", volume: 0.14 },
  music: { file: "music.wav", volume: 0.14 },
};

export const SFX_BASE_PATH = "/assets/sfx/";
export const MUTE_STORAGE_KEY = "tituah:muted";
export const AUDIO_STORAGE_KEY = "tituah:audio";
