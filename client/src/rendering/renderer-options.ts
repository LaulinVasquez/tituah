import type { ApplicationOptions } from "pixi.js";

function touchDisplay(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches;
}

export function pixiOptions(
  canvas: HTMLCanvasElement,
  extras: Partial<ApplicationOptions> = {},
): Partial<ApplicationOptions> {
  const mobile = touchDisplay();
  const dpr = window.devicePixelRatio || 1;
  return {
    canvas,
    antialias: false,
    hello: false,
    roundPixels: true,
    preference: "webgl",
    powerPreference: "high-performance",
    resolution: Math.min(dpr, mobile ? 1 : 1.5),
    autoDensity: true,
    ...extras,
  };
}
