import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH, getStage, isStageId, type PlayerState, type StageId, type StageMap } from "@tituah/shared";
import { STAGE_BACKGROUND_URLS, STAGE_VISUALS } from "./stage-config.js";

interface AmbientParticle { x: number; y: number; size: number; speed: number; phase: number }

export class StageRenderer {
  readonly far = new Container();
  readonly distant = new Container();
  readonly props = new Container();
  readonly platforms = new Container();
  readonly shadows = new Container();
  readonly foreground = new Container();

  private readonly backdrop = new Sprite();
  private readonly voidGfx = new Graphics();
  private readonly platformGfx = new Graphics();
  private readonly particles: AmbientParticle[] = Array.from({ length: 16 }, (_, index) => ({
    x: (index * 197) % 1280, y: 80 + ((index * 83) % 560), size: 1.5 + (index % 3),
    speed: 6 + (index % 5) * 3, phase: index * 0.71,
  }));
  private readonly particleSprites: Sprite[] = [];
  private readonly shadowSprites: Sprite[] = [];
  private stageId: StageId = "barnyard";
  private map: StageMap = getStage(this.stageId);

  constructor() {
    this.backdrop.anchor.set(0.5);
    this.far.eventMode = "none";
    this.distant.eventMode = "none";
    this.props.eventMode = "none";
    this.platforms.eventMode = "none";
    this.shadows.eventMode = "none";
    this.foreground.eventMode = "none";
    this.far.addChild(this.backdrop);
    this.distant.addChild(this.voidGfx);
    this.platforms.addChild(this.platformGfx);
    for (const particle of this.particles) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.width = particle.size * 2;
      sprite.height = particle.size * 2;
      sprite.alpha = 0.18;
      this.foreground.addChild(sprite);
      this.particleSprites.push(sprite);
    }
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

    this.voidGfx.cacheAsTexture(false);
    this.voidGfx.clear()
      .rect(-80, 570, 1440, 190).fill({ color: config.void, alpha: 0.3 })
      .rect(-80, 665, 1440, 95).fill({ color: 0x02050a, alpha: 0.28 });
    this.voidGfx.cacheAsTexture(true);

    this.platformGfx.cacheAsTexture(false);
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
    this.platformGfx.cacheAsTexture(true);

    for (const sprite of this.particleSprites) {
      sprite.tint = config.particle;
    }
  }

  update(players: PlayerState[], time: number): void {
    let focusX = this.map.width / 2;
    if (players.length) {
      let sum = 0;
      for (const player of players) sum += player.position.x;
      focusX = sum / players.length;
    }
    this.far.x = -(focusX - this.map.width / 2) * 0.035;

    let shadowCount = 0;
    for (const player of players) {
      if (!player.grounded || player.lives <= 0) continue;
      const sprite = this.shadowAt(shadowCount);
      sprite.position.set(player.position.x, player.position.y + 5);
      sprite.visible = true;
      shadowCount += 1;
    }
    for (let index = shadowCount; index < this.shadowSprites.length; index += 1) {
      this.shadowSprites[index].visible = false;
    }

    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      const sprite = this.particleSprites[index];
      sprite.x = (particle.x + time * particle.speed) % 1320 - 20;
      sprite.y = particle.y + Math.sin(time * 0.7 + particle.phase) * 12;
    }
  }

  private shadowAt(index: number): Sprite {
    let sprite = this.shadowSprites[index];
    if (sprite) return sprite;
    sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.tint = 0x05070d;
    sprite.alpha = 0.3;
    sprite.width = 62;
    sprite.height = 16;
    this.shadows.addChild(sprite);
    this.shadowSprites[index] = sprite;
    return sprite;
  }
}
