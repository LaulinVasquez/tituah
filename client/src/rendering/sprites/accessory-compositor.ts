import { Texture } from "pixi.js";
import { colorHue, type AccessorySprite, type FighterColor } from "./appearance.js";
import {
  FIGHTER_ANIMATIONS,
  FIGHTER_VISUAL_HEIGHT,
  type FighterAnimation,
  type FighterFrame,
} from "./fighter-atlas.js";

export interface BakedFighterFrame {
  texture: Texture;
  anchorX: number;
  anchorY: number;
}

export interface BakeSources {
  fighterSheet: Texture;
  runningSheet: Texture;
  extras: Map<string, Texture>;
}

const cache = new Map<string, BakedFighterFrame>();

export function bakeFighterFrame(
  cacheKey: string,
  animation: FighterAnimation,
  frameIndex: number,
  accessories: AccessorySprite[],
  color: FighterColor,
  sources: BakeSources,
): BakedFighterFrame {
  const key = `${cacheKey}|${animation}|${frameIndex}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const definition = FIGHTER_ANIMATIONS[animation];
  const frame = definition.frames[frameIndex] ?? definition.frames[0];
  const sheet = definition.sheet === "running" ? sources.runningSheet : sources.fighterSheet;
  const baked = compositeFrame(frame, accessories, color, sheet, sources.extras);
  cache.set(key, baked);
  return baked;
}

function compositeFrame(
  frame: FighterFrame,
  accessories: AccessorySprite[],
  color: FighterColor,
  sheet: Texture,
  extras: Map<string, Texture>,
): BakedFighterFrame {
  const scale = FIGHTER_VISUAL_HEIGHT / frame.height;
  const offsetX = frame.offsetX ?? 0;
  const offsetY = frame.offsetY ?? 0;
  const feetX = frame.width / 2 - offsetX;
  const feetY = frame.height - offsetY / scale;

  const placements = accessories.map((accessory) => {
    const source = accessoryImage(accessory, extras, sheet);
    const destHeight = (accessory.visualHeight ?? 42) / scale;
    const destWidth = source.width * (destHeight / source.height);
    const bottomX = feetX + accessory.anchorX / scale;
    const bottomY = feetY + accessory.anchorY / scale;
    return {
      ...source,
      dx: bottomX - destWidth / 2,
      dy: bottomY - destHeight,
      dw: destWidth,
      dh: destHeight,
    };
  });

  let minX = 0;
  let minY = 0;
  let maxX = frame.width;
  let maxY = frame.height;
  for (const placement of placements) {
    minX = Math.min(minX, placement.dx);
    minY = Math.min(minY, placement.dy);
    maxX = Math.max(maxX, placement.dx + placement.dw);
    maxY = Math.max(maxY, placement.dy + placement.dh);
  }

  const padLeft = Math.max(0, Math.ceil(-minX));
  const padTop = Math.max(0, Math.ceil(-minY));
  const padRight = Math.max(0, Math.ceil(maxX - frame.width));
  const padBottom = Math.max(0, Math.ceil(maxY - frame.height));
  const width = Math.max(1, Math.ceil(frame.width + padLeft + padRight));
  const height = Math.max(1, Math.ceil(frame.height + padTop + padBottom));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not composite fighter accessories");

  const hue = colorHue(color);
  ctx.imageSmoothingEnabled = false;
  if (hue != null) ctx.filter = `hue-rotate(${hue}deg) saturate(120%)`;
  ctx.drawImage(
    drawable(sheet),
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    padLeft,
    padTop,
    frame.width,
    frame.height,
  );
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const placement of placements) {
    ctx.drawImage(
      placement.image,
      placement.sx,
      placement.sy,
      placement.sw,
      placement.sh,
      padLeft + placement.dx,
      padTop + placement.dy,
      placement.dw,
      placement.dh,
    );
  }

  return {
    texture: Texture.from(canvas),
    anchorX: (padLeft + feetX) / width,
    anchorY: (padTop + feetY) / height,
  };
}

function accessoryImage(
  accessory: AccessorySprite,
  extras: Map<string, Texture>,
  sheet: Texture,
): { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const extra = extras.get(accessory.id);
  if (extra) {
    return {
      image: drawable(extra),
      sx: 0,
      sy: 0,
      sw: extra.width,
      sh: extra.height,
      width: extra.width,
      height: extra.height,
    };
  }
  return {
    image: drawable(sheet),
    sx: accessory.frame.x,
    sy: accessory.frame.y,
    sw: accessory.frame.width,
    sh: accessory.frame.height,
    width: accessory.frame.width,
    height: accessory.frame.height,
  };
}

function drawable(texture: Texture): CanvasImageSource {
  const resource = texture.source.resource as unknown;
  if (
    resource instanceof HTMLImageElement
    || resource instanceof HTMLCanvasElement
    || resource instanceof ImageBitmap
    || resource instanceof HTMLVideoElement
    || (typeof VideoFrame !== "undefined" && resource instanceof VideoFrame)
    || (typeof OffscreenCanvas !== "undefined" && resource instanceof OffscreenCanvas)
  ) {
    return resource;
  }
  throw new Error("Fighter texture cannot be drawn into a sprite");
}
