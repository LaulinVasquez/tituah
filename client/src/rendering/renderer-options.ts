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
    // Let Pixi choose the best supported renderer in WKWebView instead of
    // hard-failing when WebGL is unavailable or limited on iOS.
    resolution: Math.min(dpr, mobile ? 1 : 1.5),
    autoDensity: true,
    ...extras,
  };
}
