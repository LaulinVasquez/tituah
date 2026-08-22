import {
  SPRITE_ASSET_IDS,
  emptyAvatar,
  type AvatarConfiguration,
  type FighterColorId,
} from "@tituah/shared";
import type { FighterFrame } from "./fighter-atlas.js";

export type FighterColor = Exclude<FighterColorId, "base_01"> | "orange";

export interface AccessorySprite {
  id: string;
  frame: FighterFrame;
  anchorX: number;
  anchorY: number;
}

export interface FighterAppearance {
  color: FighterColor;
  accessories: AccessorySprite[];
}

const COLOR_HUES: Record<FighterColor, number | null> = {
  orange: null,
  red: -18,
  blue: 190,
  green: 95,
  yellow: 38,
  purple: 260,
};

const ACCESSORIES: Record<string, AccessorySprite> = {
  [SPRITE_ASSET_IDS.sunglasses]: {
    id: SPRITE_ASSET_IDS.sunglasses,
    frame: { x: 24, y: 868, width: 92, height: 36 },
    anchorX: 0,
    anchorY: -72,
  },
  [SPRITE_ASSET_IDS.crown]: {
    id: SPRITE_ASSET_IDS.crown,
    frame: { x: 132, y: 848, width: 88, height: 56 },
    anchorX: 0,
    anchorY: -98,
  },
  [SPRITE_ASSET_IDS.redBandana]: {
    id: SPRITE_ASSET_IDS.redBandana,
    frame: { x: 236, y: 858, width: 96, height: 46 },
    anchorX: 0,
    anchorY: -90,
  },
  [SPRITE_ASSET_IDS.basicCap]: {
    id: SPRITE_ASSET_IDS.basicCap,
    frame: { x: 348, y: 848, width: 102, height: 58 },
    anchorX: 0,
    anchorY: -96,
  },
  [SPRITE_ASSET_IDS.blueBandana]: {
    id: SPRITE_ASSET_IDS.blueBandana,
    frame: { x: 466, y: 858, width: 96, height: 46 },
    anchorX: 0,
    anchorY: -90,
  },
  [SPRITE_ASSET_IDS.topHat]: {
    id: SPRITE_ASSET_IDS.topHat,
    frame: { x: 578, y: 832, width: 84, height: 74 },
    anchorX: 0,
    anchorY: -104,
  },
  [SPRITE_ASSET_IDS.goldChain]: {
    id: SPRITE_ASSET_IDS.goldChain,
    frame: { x: 678, y: 862, width: 86, height: 48 },
    anchorX: 0,
    anchorY: -44,
  },
};

export function appearanceFromAvatar(
  avatar: AvatarConfiguration | undefined,
  spawnIndex: number,
): FighterAppearance {
  const config = avatar ?? emptyAvatar();
  const equipped = [
    config.headAccessoryId,
    config.faceAccessoryId,
    config.bodyAccessoryId,
    config.waistAccessoryId,
    config.backAccessoryId,
    config.leftHandAccessoryId,
    config.rightHandAccessoryId,
    config.feetAccessoryId,
    config.effectAccessoryId,
  ].filter((id): id is string => Boolean(id));

  return {
    color: colorFromAvatar(config.baseAvatarId, spawnIndex),
    accessories: equipped
      .map((id) => ACCESSORIES[id])
      .filter((item): item is AccessorySprite => Boolean(item)),
  };
}

export function colorHue(color: FighterColor): number | null {
  return COLOR_HUES[color];
}

function colorFromAvatar(baseAvatarId: string, spawnIndex: number): FighterColor {
  if (baseAvatarId === "red" || baseAvatarId === "blue" || baseAvatarId === "green"
    || baseAvatarId === "yellow" || baseAvatarId === "purple" || baseAvatarId === "orange") {
    return baseAvatarId;
  }
  return spawnIndex % 2 === 0 ? "orange" : "blue";
}
