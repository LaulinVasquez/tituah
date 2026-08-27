import { resolveAssetUrl } from "../../config/runtime.js";
import { SPRITE_ASSET_IDS } from "@tituah/shared";
import type { FighterAnimation, FighterFrame } from "./fighter-atlas.js";

/** Full animation sheet with sunglasses (and sneakers) baked in. */
export const SUNGLASSES_SHEET_URL = resolveAssetUrl(
  "/assets/characters/accessories/sunglasses.png",
);

/**
 * Frame crops for `sunglasses.png` (1659×948). Layout mirrors the main
 * fighter sheet animations that live on `character-enhanced.png`, plus a
 * short run cycle in row 1 (so we skip the separate running sheet).
 */
export const SUNGLASSES_ANIMATION_FRAMES: Partial<
  Record<FighterAnimation, readonly FighterFrame[]>
> = {
  idle: [
    { x: 30, y: 82, width: 127, height: 125 },
    { x: 172, y: 80, width: 126, height: 125 },
    { x: 313, y: 78, width: 128, height: 125 },
    { x: 471, y: 77, width: 130, height: 126 },
  ],
  run: [
    { x: 669, y: 70, width: 139, height: 125 },
    { x: 832, y: 77, width: 147, height: 126 },
    { x: 1004, y: 76, width: 138, height: 124 },
    { x: 1176, y: 70, width: 143, height: 127 },
    { x: 1340, y: 71, width: 141, height: 128 },
    { x: 1490, y: 74, width: 138, height: 127 },
  ],
  jump: [
    { x: 30, y: 280, width: 130, height: 153 },
    { x: 189, y: 271, width: 137, height: 166 },
    { x: 361, y: 288, width: 145, height: 135 },
  ],
  fall: [
    { x: 549, y: 301, width: 135, height: 132 },
    { x: 734, y: 311, width: 130, height: 122 },
    { x: 896, y: 306, width: 126, height: 131 },
  ],
  land: [
    { x: 1054, y: 315, width: 134, height: 124 },
    { x: 1207, y: 317, width: 130, height: 122 },
    { x: 1351, y: 317, width: 129, height: 123 },
    { x: 1503, y: 322, width: 131, height: 118 },
  ],
  slapCharge: [
    { x: 34, y: 502, width: 134, height: 124 },
    { x: 195, y: 505, width: 133, height: 123 },
    { x: 346, y: 503, width: 165, height: 126 },
  ],
  slapAttack: [
    { x: 547, y: 503, width: 164, height: 123 },
    { x: 728, y: 485, width: 380, height: 153, offsetX: 40 },
  ],
  slapRecovery: [
    { x: 1155, y: 507, width: 141, height: 122 },
    { x: 1318, y: 511, width: 159, height: 119 },
    { x: 1487, y: 511, width: 140, height: 119 },
  ],
  hit: [
    { x: 26, y: 705, width: 141, height: 135 },
    { x: 210, y: 696, width: 125, height: 150 },
    { x: 376, y: 696, width: 111, height: 148 },
  ],
  ko: [
    { x: 521, y: 732, width: 98, height: 104 },
    { x: 630, y: 740, width: 152, height: 97 },
    { x: 820, y: 760, width: 145, height: 81 },
  ],
};

/** Face accessories that ship as a full replacement fighter sheet. */
export const BAKED_FACE_ACCESSORY_SHEETS: Record<
  string,
  {
    url: string;
    frames: Partial<Record<FighterAnimation, readonly FighterFrame[]>>;
  }
> = {
  [SPRITE_ASSET_IDS.sunglasses]: {
    url: SUNGLASSES_SHEET_URL,
    frames: SUNGLASSES_ANIMATION_FRAMES,
  },
};

export function bakedSheetForFaceAccessory(
  faceAccessoryId: string | null | undefined,
): (typeof BAKED_FACE_ACCESSORY_SHEETS)[string] | null {
  if (!faceAccessoryId) return null;
  return BAKED_FACE_ACCESSORY_SHEETS[faceAccessoryId] ?? null;
}
