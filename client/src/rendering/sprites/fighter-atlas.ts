export type FighterAnimation =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "land"
  | "slapCharge"
  | "slapAttack"
  | "slapRecovery"
  | "hit"
  | "ko";

export interface FighterFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
}

export interface FighterAnimationDefinition {
  frames: FighterFrame[];
  fps: number;
  loop: boolean;
  sheet?: "fighter" | "running";
}

// Explicit regions for character_enhanced.png. The source is not a grid, so the
// rectangles are kept tight to exclude headings, adjacent poses, and reference art.
export const FIGHTER_ANIMATIONS: Record<FighterAnimation, FighterAnimationDefinition> = {
  idle: {
    fps: 5,
    loop: true,
    frames: [
      { x: 20, y: 50, width: 125, height: 120 },
      { x: 155, y: 51, width: 122, height: 119 },
      { x: 291, y: 51, width: 128, height: 119 },
      { x: 442, y: 50, width: 126, height: 120 },
    ],
  },
  run: {
    fps: 12,
    loop: true,
    sheet: "running",
    frames: [
      { x: 31, y: 27, width: 435, height: 351 },
      { x: 520, y: 28, width: 435, height: 350 },
      { x: 1025, y: 26, width: 438, height: 352 },
      { x: 1514, y: 29, width: 438, height: 349 },
      { x: 14, y: 404, width: 453, height: 365, offsetX: 8 },
      { x: 519, y: 405, width: 441, height: 364, offsetX: 8 },
      { x: 1020, y: 404, width: 448, height: 365, offsetX: 9 },
      { x: 1509, y: 411, width: 464, height: 358, offsetX: 18 },
    ],
  },
  jump: {
    fps: 9,
    loop: false,
    frames: [
      { x: 20, y: 210, width: 134, height: 146 },
      { x: 168, y: 210, width: 143, height: 146 },
      { x: 327, y: 226, width: 148, height: 130 },
    ],
  },
  fall: {
    fps: 7,
    loop: true,
    frames: [
      { x: 513, y: 226, width: 142, height: 130 },
      { x: 669, y: 226, width: 141, height: 130 },
      { x: 821, y: 232, width: 132, height: 124 },
    ],
  },
  land: {
    fps: 10,
    loop: false,
    frames: [
      { x: 967, y: 235, width: 139, height: 122 },
      { x: 1114, y: 232, width: 135, height: 125 },
      { x: 1248, y: 238, width: 128, height: 119 },
      { x: 1387, y: 239, width: 138, height: 118 },
    ],
  },
  slapCharge: {
    fps: 7,
    loop: true,
    frames: [
      { x: 24, y: 414, width: 132, height: 119 },
      { x: 174, y: 414, width: 130, height: 119 },
      { x: 321, y: 413, width: 151, height: 120 },
    ],
  },
  slapAttack: {
    fps: 16,
    loop: false,
    frames: [
      { x: 493, y: 412, width: 165, height: 122 },
      { x: 653, y: 388, width: 357, height: 148, offsetX: 35 },
    ],
  },
  slapRecovery: {
    fps: 10,
    loop: false,
    frames: [
      { x: 1052, y: 412, width: 153, height: 122 },
      { x: 1198, y: 411, width: 164, height: 123 },
      { x: 1359, y: 412, width: 166, height: 122 },
    ],
  },
  hit: {
    fps: 10,
    loop: false,
    frames: [
      { x: 20, y: 584, width: 137, height: 118 },
      { x: 166, y: 580, width: 135, height: 122 },
      { x: 303, y: 579, width: 112, height: 123 },
      { x: 407, y: 588, width: 98, height: 114 },
    ],
  },
  ko: {
    fps: 6,
    loop: false,
    frames: [
      { x: 514, y: 586, width: 148, height: 116 },
      { x: 671, y: 594, width: 168, height: 108 },
      { x: 861, y: 574, width: 146, height: 128 },
    ],
  },
};

export const FIGHTER_SHEET_URL = "/assets/characters/character-enhanced.png";
export const RUNNING_SHEET_URL = "/assets/characters/running.png";
export const FIGHTER_VISUAL_HEIGHT = 106;
