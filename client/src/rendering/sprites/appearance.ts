import {
  emptyAvatar,
  fighterColorFromId,
  throwableIdFromAvatar,
  type AvatarConfiguration,
  type FighterColor,
  type ThrowableId,
} from "@tituah/shared";
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
  throwableId: ThrowableId;
  /** Face slot — when a baked sheet exists, fighter-sprite swaps to it. */
  faceAccessoryId: string | null;
  accessories: AccessorySprite[];
}

/** Hue rotate from the orange base sheet. `null` = no hue change. */
const COLOR_HUES: Record<FighterColor, number | null> = {
  orange: null,
  red: -18,
  blue: 190,
  green: 95,
  yellow: 38,
  purple: 260,
  cyan: 168,
  pink: 300,
  lime: 78,
  teal: 152,
  white: null,
  black: null,
};

export interface ColorVariantStyle {
  hue: number | null;
  saturate?: number;
  brightness?: number;
  greyscale?: number;
}

export function colorVariantStyle(color: FighterColor): ColorVariantStyle {
  if (color === "white") return { hue: null, saturate: -0.85, brightness: 0.55 };
  if (color === "black") return { hue: null, saturate: -0.35, brightness: -0.45 };
  const hue = COLOR_HUES[color];
  if (hue == null) return { hue: null };
  return { hue, saturate: 0.28 };
}

export function appearanceKey(avatar: AvatarConfiguration | undefined): string {
  const face = avatar?.faceAccessoryId ?? "";
  return `${fighterColorFromId(avatar?.baseAvatarId)}:${throwableIdFromAvatar(avatar?.throwableId)}:${face}`;
}

export function appearanceFromAvatar(avatar: AvatarConfiguration | undefined): FighterAppearance {
  const config = avatar ?? emptyAvatar();
  const faceAccessoryId = config.faceAccessoryId ?? null;
  return {
    color: fighterColorFromId(config.baseAvatarId),
    throwableId: throwableIdFromAvatar(config.throwableId),
    faceAccessoryId,
    accessories: [],
  };
}

export function colorHue(color: FighterColor): number | null {
  return COLOR_HUES[color];
}

/** CSS `filter` string for canvas compositing (hue-rotate / etc.). */
export function colorCssFilter(color: FighterColor): string {
  const style = colorVariantStyle(color);
  const parts: string[] = [];
  if (style.hue != null) parts.push(`hue-rotate(${style.hue}deg)`);
  if (style.saturate != null) {
    const sat = Math.max(0, 1 + style.saturate);
    parts.push(`saturate(${Math.round(sat * 100)}%)`);
  } else if (style.hue != null) {
    parts.push("saturate(120%)");
  }
  if (style.brightness != null) {
    parts.push(`brightness(${Math.max(0.05, 1 + style.brightness)})`);
  }
  if (style.greyscale != null) parts.push(`grayscale(${style.greyscale})`);
  return parts.join(" ");
}
