import { emptyAvatar, fighterColorFromId, type AvatarConfiguration, type FighterColor } from "@tituah/shared";
import type { FighterFrame } from "./fighter-atlas.js";

export type { FighterColor };

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

export function appearanceKey(avatar: AvatarConfiguration | undefined): string {
  return fighterColorFromId(avatar?.baseAvatarId);
}

export function appearanceFromAvatar(avatar: AvatarConfiguration | undefined): FighterAppearance {
  const config = avatar ?? emptyAvatar();
  return {
    color: fighterColorFromId(config.baseAvatarId),
    accessories: [],
  };
}

export function colorHue(color: FighterColor): number | null {
  return COLOR_HUES[color];
}
