import { Assets, Rectangle, Texture } from "pixi.js";
import throwablesSheetUrl from "../../../public/assets/characters/throwables.png";
import { resolveAssetUrl } from "../../config/runtime.js";
import type { ThrowableId } from "@tituah/shared";

export const THROWABLES_SHEET_URL = resolveAssetUrl(throwablesSheetUrl);

/** Overlay shown on throw wind-up (0) and release (1). Follow-through has no overlay. */
export type ThrowableOverlayFrame = 0 | 1;

export interface ThrowableCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grip point on the object texture (0–1), aligned to the throwing hand. */
  gripX: number;
  gripY: number;
}

/** Hand position on the matching throw fighter frame, relative to bottom-center. */
export interface ThrowHandAnchor {
  offsetX: number;
  offsetY: number;
}

/** Measured against throw.png (2172×724) white-glove clusters. */
export const THROW_HAND_ANCHORS: Record<ThrowableOverlayFrame, ThrowHandAnchor> = {
  0: { offsetX: -198, offsetY: -356 },
  1: { offsetX: 278, offsetY: -271 },
};

/** Scale throwable art relative to the fighter frame pixel scale. */
export const THROWABLE_OVERLAY_SCALE = 0.55;

const THROWABLE_ROWS: ThrowableId[] = ["sandal", "stick", "pan", "bat"];

/** throwables.png is a 4×4 grid (object × spin frame). Cell size 384×256. */
export const THROWABLES_COLS = 4;
export const THROWABLES_ROWS = 4;
export const THROWABLES_SHEET_WIDTH = 1536;
export const THROWABLES_SHEET_HEIGHT = 1024;
export const THROWABLES_CELL_WIDTH = THROWABLES_SHEET_WIDTH / THROWABLES_COLS;
export const THROWABLES_CELL_HEIGHT = THROWABLES_SHEET_HEIGHT / THROWABLES_ROWS;

/**
 * Tight crops within each 384×256 cell for wind-up (col 0) and release (col 1).
 * Grip sits near the object center inside the motion trail.
 */
export const THROWABLE_CROPS: Record<ThrowableId, [ThrowableCrop, ThrowableCrop]> = {
  sandal: [
    { x: 64, y: 20, width: 320, height: 236, gripX: 0.52, gripY: 0.5 },
    { x: 400, y: 4, width: 358, height: 252, gripX: 0.5, gripY: 0.5 },
  ],
  stick: [
    { x: 74, y: 256, width: 310, height: 256, gripX: 0.5, gripY: 0.5 },
    { x: 384, y: 256, width: 384, height: 256, gripX: 0.5, gripY: 0.5 },
  ],
  pan: [
    { x: 41, y: 512, width: 343, height: 256, gripX: 0.5, gripY: 0.5 },
    { x: 384, y: 512, width: 384, height: 256, gripX: 0.5, gripY: 0.5 },
  ],
  bat: [
    { x: 52, y: 768, width: 332, height: 233, gripX: 0.5, gripY: 0.48 },
    { x: 384, y: 768, width: 384, height: 237, gripX: 0.5, gripY: 0.48 },
  ],
};

let texturePromise: Promise<Record<ThrowableId, Texture[]>> | null = null;

export function loadThrowableTextures(): Promise<Record<ThrowableId, Texture[]>> {
  if (texturePromise) return texturePromise;
  texturePromise = Assets.load<Texture>(THROWABLES_SHEET_URL).then((sheet) => {
    const result = {} as Record<ThrowableId, Texture[]>;
    for (const id of THROWABLE_ROWS) {
      result[id] = THROWABLE_CROPS[id].map(
        (crop) =>
          new Texture({
            source: sheet.source,
            frame: new Rectangle(crop.x, crop.y, crop.width, crop.height),
          }),
      );
    }
    return result;
  });
  return texturePromise;
}

export function throwableCrop(id: ThrowableId, frame: ThrowableOverlayFrame): ThrowableCrop {
  return THROWABLE_CROPS[id][frame];
}
