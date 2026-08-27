import { Assets, Texture } from "pixi.js";
import { resolveAssetUrl } from "../../config/runtime.js";
import type { ThrowableId } from "@tituah/shared";

/** Static item art (no projectile motion trail) — picker icons + hand-held overlay. */
export const THROWABLE_ITEM_URLS: Record<ThrowableId, string> = {
  sandal: resolveAssetUrl("/assets/items/sandal.png"),
  stick: resolveAssetUrl("/assets/items/stick.png"),
  pan: resolveAssetUrl("/assets/items/pan.png"),
  bat: resolveAssetUrl("/assets/items/bat.png"),
};

/** Overlay shown on throw wind-up (0). Release/follow-through have no overlay (projectile is in flight). */
export type ThrowableOverlayFrame = 0 | 1;

export interface ThrowableCrop {
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

/**
 * Hand (rear glove) on slap-charge frames — lower on the body, arcing through
 * the wind-up so the item can lerp between these points.
 */
export const SLAP_CHARGE_HAND_ANCHORS: readonly ThrowHandAnchor[] = [
  { offsetX: -32, offsetY: -56 },
  { offsetX: -44, offsetY: -48 },
  { offsetX: -54, offsetY: -58 },
];

/** Scale throwable art relative to the fighter frame pixel scale. */
export const THROWABLE_OVERLAY_SCALE = 0.17;
/** Smaller while held in the slap-charge wind-up hand. */
export const THROWABLE_CHARGE_OVERLAY_SCALE = 0.07;

const THROWABLE_IDS: ThrowableId[] = ["sandal", "stick", "pan", "bat"];

/**
 * Grip points on the static item PNGs (held in hand during charge / throw wind-up).
 * Tuned toward the natural handle / strap for each object.
 */
export const THROWABLE_GRIPS: Record<ThrowableId, ThrowableCrop> = {
  sandal: { gripX: 0.48, gripY: 0.55 },
  stick: { gripX: 0.32, gripY: 0.68 },
  pan: { gripX: 0.78, gripY: 0.28 },
  bat: { gripX: 0.22, gripY: 0.78 },
};

let texturePromise: Promise<Record<ThrowableId, Texture[]>> | null = null;

export function loadThrowableTextures(): Promise<Record<ThrowableId, Texture[]>> {
  if (texturePromise) return texturePromise;
  texturePromise = Promise.all(
    THROWABLE_IDS.map(async (id) => {
      const texture = await Assets.load<Texture>(THROWABLE_ITEM_URLS[id]);
      // Same static art for both overlay frame slots (release uses the in-flight projectile).
      return [id, [texture, texture] as Texture[]] as const;
    }),
  ).then((entries) => {
    const result = {} as Record<ThrowableId, Texture[]>;
    for (const [id, frames] of entries) result[id] = frames;
    return result;
  });
  return texturePromise;
}

export function throwableCrop(id: ThrowableId, _frame: ThrowableOverlayFrame): ThrowableCrop {
  return THROWABLE_GRIPS[id];
}
