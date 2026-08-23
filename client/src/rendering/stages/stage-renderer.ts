import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH, getStage, isStageId, type PlayerState, type StageId, type StageMap } from "@tituah/shared";
import { STAGE_BACKGROUND_URLS, STAGE_VISUALS } from "./stage-config.js";

interface AmbientParticle { x: number; y: number; size: number; speed: number; phase: number }

export class StageRenderer {
  readonly far = new Container();
  readonly distant = new Container();
  readonly props = new Container();
  readonly platforms = new Container();
  readonly shadows = new Graphics();
  readonly foreground = new Graphics();

  private readonly backdrop = new Sprite();
  private readonly voidGfx = new Graphics();
  private readonly platformGfx = new Graphics();
  private readonly particles: AmbientParticle[] = Array.from({ length: 24 }, (_, index) => ({
    x: (index * 197) % 1280, y: 80 + ((index * 83) % 560), size: 1.5 + (index % 3),
    speed: 6 + (index % 5) * 3, phase: index * 0.71,
  }));
  private stageId: StageId = "barnyard";
  private map: StageMap = getStage(this.stageId);

  constructor() {
    this.backdrop.anchor.set(0.5);
    this.far.addChild(this.backdrop);
    this.distant.addChild(this.voidGfx);
    this.platforms.addChild(this.platformGfx);
  }

  async load(): Promise<void> {
    await Assets.load(STAGE_BACKGROUND_URLS);
    this.setStage("barnyard");
  }

  setStage(stageId: string): void {
    this.stageId = isStageId(stageId) ? stageId : "barnyard";
    this.map = getStage(this.stageId);
    const config = STAGE_VISUALS[this.stageId];
    const texture = Assets.get<Texture>(config.background);

    this.backdrop.texture = texture;
    const backgroundScale = Math.max(GAME_WIDTH / texture.width, GAME_HEIGHT / texture.height);
    this.backdrop.anchor.set(config.focusX, 0.5);
    this.backdrop.scale.set(backgroundScale);
    this.backdrop.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    this.voidGfx.clear()
      .rect(-80, 570, 1440, 190).fill({ color: config.void, alpha: 0.3 })
      .rect(-80, 665, 1440, 95).fill({ color: 0x02050a, alpha: 0.28 });

    this.platformGfx.clear();
    for (const platform of this.map.platforms) {
      const radius = Math.min(12, platform.height / 2);
      this.platformGfx
        .roundRect(platform.x + 5, platform.y + 9, platform.width, platform.height, radius)
        .fill({ color: config.platformShadow, alpha: 0.48 })
        .roundRect(platform.x, platform.y, platform.width, platform.height, radius)
        .fill(config.platformBody)
        .roundRect(platform.x, platform.y, platform.width, 7, radius)
        .fill(config.platformTop)
        .rect(platform.x + 10, platform.y + platform.height - 6, platform.width - 20, 6)
        .fill({ color: config.platformEdge, alpha: 0.9 });
    }
  }

  update(players: PlayerState[], time: number): void {
    const focusX = players.length
      ? players.reduce((sum, player) => sum + player.position.x, 0) / players.length
      : this.map.width / 2;
    this.far.x = -(focusX - this.map.width / 2) * 0.035;

    this.shadows.clear();
    for (const player of players) {
      if (!player.grounded || player.lives <= 0) continue;
      this.shadows.ellipse(player.position.x, player.position.y + 5, 31, 8)
        .fill({ color: 0x05070d, alpha: 0.3 });
    }

    const config = STAGE_VISUALS[this.stageId];
    this.foreground.clear();
    for (const particle of this.particles) {
      const x = (particle.x + time * particle.speed) % 1320 - 20;
      const y = particle.y + Math.sin(time * 0.7 + particle.phase) * 12;
      this.foreground.circle(x, y, particle.size)
        .fill({ color: config.particle, alpha: 0.18 });
    }
  }
}
