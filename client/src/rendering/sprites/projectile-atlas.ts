import { Assets, Rectangle, Texture } from "pixi.js";
import { resolveAssetUrl } from "../../config/runtime.js";
import { throwableIdFromAvatar, type ThrowableId } from "@tituah/shared";

/** Shared layout for all throwable projectile sheets (4×2 = 8 frames). */
export const PROJECTILE_FRAME_COLS = 4;
export const PROJECTILE_FRAME_ROWS = 2;
export const PROJECTILE_FRAME_COUNT = 8;
export const PROJECTILE_SHEET_WIDTH = 1536;
export const PROJECTILE_SHEET_HEIGHT = 1024;
export const PROJECTILE_FRAME_WIDTH = PROJECTILE_SHEET_WIDTH / PROJECTILE_FRAME_COLS;
export const PROJECTILE_FRAME_HEIGHT = PROJECTILE_SHEET_HEIGHT / PROJECTILE_FRAME_ROWS;
export const PROJECTILE_FPS = 18;
export const PROJECTILE_DISPLAY_SCALE = 0.19;

export const PROJECTILE_SHEET_URLS: Record<ThrowableId, string> = {
  sandal: resolveAssetUrl("/assets/projectiles/flipflop.png"),
  stick: resolveAssetUrl("/assets/projectiles/stick.png"),
  pan: resolveAssetUrl("/assets/projectiles/pan.png"),
  bat: resolveAssetUrl("/assets/projectiles/baseball_bat.png"),
};

/** @deprecated Prefer PROJECTILE_* constants; kept for existing call sites. */
export const FLIPFLOP_SHEET_URL = PROJECTILE_SHEET_URLS.sandal;
export const FLIPFLOP_FRAME_COLS = PROJECTILE_FRAME_COLS;
export const FLIPFLOP_FRAME_ROWS = PROJECTILE_FRAME_ROWS;
export const FLIPFLOP_FRAME_COUNT = PROJECTILE_FRAME_COUNT;
export const FLIPFLOP_SHEET_WIDTH = PROJECTILE_SHEET_WIDTH;
export const FLIPFLOP_SHEET_HEIGHT = PROJECTILE_SHEET_HEIGHT;
export const FLIPFLOP_FRAME_WIDTH = PROJECTILE_FRAME_WIDTH;
export const FLIPFLOP_FRAME_HEIGHT = PROJECTILE_FRAME_HEIGHT;
export const FLIPFLOP_FPS = PROJECTILE_FPS;
export const FLIPFLOP_DISPLAY_SCALE = PROJECTILE_DISPLAY_SCALE;

/** Match in-game projectile size when the preview stage scales fighters by `stageScale`. */
export function projectilePreviewScale(stageScale: number): number {
  return PROJECTILE_DISPLAY_SCALE * stageScale;
}

export function flipflopPreviewScale(stageScale: number): number {
  return projectilePreviewScale(stageScale);
}

let texturePromise: Promise<Record<ThrowableId, Texture[]>> | null = null;

function sliceSheet(sheet: Texture): Texture[] {
  return Array.from({ length: PROJECTILE_FRAME_COUNT }, (_, index) => {
    const col = index % PROJECTILE_FRAME_COLS;
    const row = Math.floor(index / PROJECTILE_FRAME_COLS);
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(
        col * PROJECTILE_FRAME_WIDTH,
        row * PROJECTILE_FRAME_HEIGHT,
        PROJECTILE_FRAME_WIDTH,
        PROJECTILE_FRAME_HEIGHT,
      ),
    });
  });
}

export function loadProjectileTextures(): Promise<Record<ThrowableId, Texture[]>> {
  if (texturePromise) return texturePromise;
  const ids = Object.keys(PROJECTILE_SHEET_URLS) as ThrowableId[];
  texturePromise = Promise.all(
    ids.map(async (id) => {
      const sheet = await Assets.load<Texture>(PROJECTILE_SHEET_URLS[id]);
      return [id, sliceSheet(sheet)] as const;
    }),
  ).then((entries) => Object.fromEntries(entries) as Record<ThrowableId, Texture[]>);
  return texturePromise;
}

export function loadFlipflopTextures(): Promise<Texture[]> {
  return loadProjectileTextures().then((all) => all.sandal);
}

export function projectileTexturesFor(
  all: Record<ThrowableId, Texture[]>,
  throwableId: string | null | undefined,
): Texture[] {
  return all[throwableIdFromAvatar(throwableId)];
}
