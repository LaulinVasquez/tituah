import type { StageMap } from "../types.js";

export const TEST_STAGE_ID = "test-arena";

export const TEST_STAGE: StageMap = {
  id: TEST_STAGE_ID,
  width: 1280,
  height: 720,
  platforms: [
    {
      id: "ground",
      x: 80,
      y: 620,
      width: 1120,
      height: 36,
    },
    {
      id: "mid-left",
      x: 180,
      y: 430,
      width: 300,
      height: 24,
    },
    {
      id: "mid-right",
      x: 800,
      y: 430,
      width: 300,
      height: 24,
    },
    {
      id: "top",
      x: 470,
      y: 250,
      width: 340,
      height: 24,
    },
  ],
  spawns: [
    { x: 260, y: 620 },
    { x: 1020, y: 620 },
  ],
  blast: {
    left: -160,
    right: 1440,
    top: -240,
    bottom: 860,
  },
};

export const DEFAULT_STAGE = TEST_STAGE;
