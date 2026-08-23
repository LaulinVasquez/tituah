import type { StageMap } from "../types.js";

export type StageId = "barnyard" | "fridge" | "meadow";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GAME_ASPECT_RATIO = GAME_WIDTH / GAME_HEIGHT;

// These boundaries sit beyond the widest 0.72 camera view. A launched fighter
// therefore leaves the screen before the authoritative server counts the KO.
const blast = { left: -520, right: 1800, top: -420, bottom: 1160 };

export const BARNYARD_STAGE: StageMap = {
  id: "barnyard", width: GAME_WIDTH, height: GAME_HEIGHT,
  platforms: [
    { id: "main", x: 290, y: 560, width: 700, height: 36 },
    { id: "side-left", x: 150, y: 390, width: 270, height: 24 },
    { id: "side-right", x: 860, y: 390, width: 270, height: 24 },
    { id: "top", x: 510, y: 240, width: 260, height: 24 },
  ],
  spawns: [{ x: 430, y: 560 }, { x: 850, y: 560 }], blast,
};

export const FRIDGE_STAGE: StageMap = {
  id: "fridge", width: GAME_WIDTH, height: GAME_HEIGHT,
  platforms: [
    { id: "main", x: 300, y: 575, width: 680, height: 36 },
    { id: "left", x: 145, y: 385, width: 300, height: 24 },
    { id: "right", x: 835, y: 455, width: 300, height: 24 },
    { id: "top", x: 530, y: 245, width: 220, height: 24 },
  ],
  spawns: [{ x: 430, y: 575 }, { x: 850, y: 575 }], blast,
};

export const MEADOW_STAGE: StageMap = {
  id: "meadow", width: GAME_WIDTH, height: GAME_HEIGHT,
  platforms: [
    { id: "main", x: 355, y: 570, width: 570, height: 36 },
    { id: "side-left", x: 95, y: 410, width: 295, height: 24 },
    { id: "side-right", x: 890, y: 410, width: 295, height: 24 },
    { id: "top", x: 520, y: 240, width: 240, height: 24 },
  ],
  spawns: [{ x: 455, y: 570 }, { x: 825, y: 570 }], blast,
};

export const STAGES: Record<StageId, StageMap> = {
  barnyard: BARNYARD_STAGE, fridge: FRIDGE_STAGE, meadow: MEADOW_STAGE,
};
export const DEFAULT_STAGE_ID: StageId = "barnyard";
export const DEFAULT_STAGE = BARNYARD_STAGE;

export function isStageId(value: unknown): value is StageId {
  return value === "barnyard" || value === "fridge" || value === "meadow";
}

export function getStage(id: string): StageMap {
  return isStageId(id) ? STAGES[id] : DEFAULT_STAGE;
}
