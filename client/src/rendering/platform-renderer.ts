import { Graphics } from "pixi.js";
import type { StageMap } from "@tituah/shared";

export class PlatformRenderer {
  constructor(private readonly graphics: Graphics) {}

  draw(map: StageMap): void {
    const g = this.graphics;
    g.clear();
    g.rect(0, 0, map.width, map.height).fill(0x0b1020);
    g.rect(0, 0, map.width, 8).fill({ color: 0x162033, alpha: 0.9 });

    for (const platform of map.platforms) {
      const isGround = platform.id === "ground";
      g.roundRect(platform.x, platform.y, platform.width, platform.height, 8)
        .fill(isGround ? 0x2c3a52 : 0x3a4d6b);
      g.roundRect(platform.x, platform.y, platform.width, 6, 6).fill(0x8fb3ff);
    }
  }
}
