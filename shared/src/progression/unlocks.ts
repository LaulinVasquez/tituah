import {
  FIGHTER_COLORS,
  SPRITE_ASSET_IDS,
  THROWABLE_IDS,
  type FighterColor,
  type ThrowableId,
} from "../sprites/ids.js";

/**
 * Cosmetic unlock levels.
 *
 * Authoritative copy lives in `@tituah/shared` and is enforced on the server
 * (`PATCH /api/me`). The client only mirrors these for UI — editing the bundle
 * cannot bypass server checks.
 *
 * Spacing (level starts at 1):
 * - Variants: 4 free at Lv 1 → latest (black) at Lv 30
 * - Accessories: 2 free starters at Lv 1 → latest (gold chain) at Lv 29
 * - Throwables: sandal free at Lv 1 → latest (bat) at Lv 25
 */

export const COLOR_UNLOCK_LEVELS: Record<FighterColor, number> = {
  red: 1,
  blue: 1,
  green: 1,
  orange: 1, // default fighter
  yellow: 5,
  purple: 9,
  cyan: 12,
  pink: 16,
  lime: 19,
  teal: 23,
  white: 26,
  black: 30,
};

/** Baked accessory ids → unlock level (null / unequipped is always free). */
export const ACCESSORY_UNLOCK_LEVELS: Readonly<Record<string, number>> = {
  [SPRITE_ASSET_IDS.sunglasses]: 1,
  [SPRITE_ASSET_IDS.basicCap]: 1,
  [SPRITE_ASSET_IDS.redBandana]: 7,
  [SPRITE_ASSET_IDS.blueBandana]: 12,
  [SPRITE_ASSET_IDS.crown]: 18,
  [SPRITE_ASSET_IDS.topHat]: 23,
  [SPRITE_ASSET_IDS.goldChain]: 29,
};

export const THROWABLE_UNLOCK_LEVELS: Record<ThrowableId, number> = {
  sandal: 1,
  stick: 9,
  pan: 17,
  bat: 25,
};

export function colorUnlockLevel(color: FighterColor): number {
  return COLOR_UNLOCK_LEVELS[color];
}

export function accessoryUnlockLevel(accessoryId: string): number {
  return ACCESSORY_UNLOCK_LEVELS[accessoryId] ?? Number.POSITIVE_INFINITY;
}

export function throwableUnlockLevel(throwableId: ThrowableId): number {
  return THROWABLE_UNLOCK_LEVELS[throwableId];
}

export function isColorUnlocked(level: number, color: FighterColor): boolean {
  return level >= colorUnlockLevel(color);
}

export function isAccessoryUnlocked(level: number, accessoryId: string | null): boolean {
  if (accessoryId == null) return true;
  return level >= accessoryUnlockLevel(accessoryId);
}

export function isThrowableUnlocked(level: number, throwableId: ThrowableId): boolean {
  return level >= throwableUnlockLevel(throwableId);
}

/** First unlocked color at or below `level` (falls back to orange). */
export function defaultUnlockedColor(level: number): FighterColor {
  for (const color of FIGHTER_COLORS) {
    if (isColorUnlocked(level, color) && color === "orange") return color;
  }
  for (const color of FIGHTER_COLORS) {
    if (isColorUnlocked(level, color)) return color;
  }
  return "orange";
}

export function defaultUnlockedThrowable(level: number): ThrowableId {
  for (const id of THROWABLE_IDS) {
    if (isThrowableUnlocked(level, id)) return id;
  }
  return "sandal";
}
