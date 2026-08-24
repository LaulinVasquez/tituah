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
  url?: string;
  visualHeight?: number;
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
    frame: { x: 0, y: 0, width: 998, height: 338 },
    anchorX: 0,
    anchorY: -72,
    url: "/assets/characters/sunglasses.png",
    visualHeight: 26,
  },
  [SPRITE_ASSET_IDS.crown]: {
    id: SPRITE_ASSET_IDS.crown,
    frame: { x: 888, y: 903, width: 81, height: 69 },
    anchorX: 0,
    anchorY: -88,
  },
  [SPRITE_ASSET_IDS.redBandana]: {
    id: SPRITE_ASSET_IDS.redBandana,
    frame: { x: 979, y: 910, width: 112, height: 50 },
    anchorX: 0,
    anchorY: -80,
  },
  [SPRITE_ASSET_IDS.basicCap]: {
    id: SPRITE_ASSET_IDS.basicCap,
    frame: { x: 1096, y: 900, width: 106, height: 70 },
    anchorX: 2,
    anchorY: -86,
  },
  [SPRITE_ASSET_IDS.blueBandana]: {
    id: SPRITE_ASSET_IDS.blueBandana,
    frame: { x: 1208, y: 909, width: 110, height: 50 },
    anchorX: 0,
    anchorY: -80,
  },
  [SPRITE_ASSET_IDS.topHat]: {
    id: SPRITE_ASSET_IDS.topHat,
    frame: { x: 1331, y: 900, width: 98, height: 75 },
    anchorX: 0,
    anchorY: -96,
  },
  [SPRITE_ASSET_IDS.goldChain]: {
    id: SPRITE_ASSET_IDS.goldChain,
    frame: { x: 1437, y: 900, width: 73, height: 74 },
    anchorX: 0,
    anchorY: -46,
  },
  // Cropped from the idle pose sneakers (no standalone shoe strip on the sheet).
  [SPRITE_ASSET_IDS.sneakers]: {
    id: SPRITE_ASSET_IDS.sneakers,
    frame: { x: 35, y: 140, width: 95, height: 35 },
    anchorX: 0,
    anchorY: -2,
  },
};

export function extraAccessorySources(): Array<{ id: string; url: string }> {
  return Object.values(ACCESSORIES).flatMap((item) =>
    item.url ? [{ id: item.id, url: item.url }] : [],
  );
}

export function appearanceKey(avatar: AvatarConfiguration | undefined, spawnIndex: number): string {
  if (!avatar) return `|${spawnIndex}`;
  return `${avatar.baseAvatarId}|${spawnIndex}|${avatar.headAccessoryId}|${avatar.faceAccessoryId}|${avatar.bodyAccessoryId}|${avatar.waistAccessoryId}|${avatar.backAccessoryId}|${avatar.leftHandAccessoryId}|${avatar.rightHandAccessoryId}|${avatar.feetAccessoryId}|${avatar.effectAccessoryId}`;
}

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
