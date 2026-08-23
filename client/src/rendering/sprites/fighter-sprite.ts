import { Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { PlayerState } from "@tituah/shared";
import { appearanceFromAvatar, appearanceKey, colorHue, type AccessorySprite, type FighterAppearance } from "./appearance.js";
import {
  FIGHTER_ANIMATIONS,
  FIGHTER_SHEET_URL,
  FIGHTER_VISUAL_HEIGHT,
  RUNNING_SHEET_URL,
  type FighterAnimation,
} from "./fighter-atlas.js";

const RUN_THRESHOLD = 24;
const LAND_DURATION = 0.2;
const HIT_DURATION = 0.38;
const KO_DURATION = 0.65;
const RESPAWN_HIDE_DURATION = 0.52;

let texturePromise: Promise<Record<FighterAnimation, Texture[]>> | null = null;

function loadTextures(): Promise<Record<FighterAnimation, Texture[]>> {
  if (texturePromise) return texturePromise;
  texturePromise = Promise.all([
    Assets.load<Texture>(FIGHTER_SHEET_URL),
    Assets.load<Texture>(RUNNING_SHEET_URL),
  ]).then(([fighterSheet, runningSheet]) => {
    const result = {} as Record<FighterAnimation, Texture[]>;
    for (const [name, animation] of Object.entries(FIGHTER_ANIMATIONS)) {
      const sheet = animation.sheet === "running" ? runningSheet : fighterSheet;
      result[name as FighterAnimation] = animation.frames.map(
        (frame) => new Texture({
          source: sheet.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        }),
      );
    }
    return result;
  });
  return texturePromise;
}

export class FighterSprite extends Container {
  private readonly sprite = new Sprite();
  private readonly accessoryLayer = new Container();
  private readonly accessorySprites = new Map<string, Sprite>();
  private sheet!: Texture;
  private textures!: Record<FighterAnimation, Texture[]>;
  private animation: FighterAnimation = "idle";
  private animationStartedAt = 0;
  private wasGrounded = true;
  private hitUntil = 0;
  private hitStartedAt = 0;
  private hitDirection = 1;
  private hitStrength = 1;
  private koUntil = 0;
  private hiddenUntil = 0;
  private colorKey = "";
  private appearanceCacheKey = "";
  private appearance: FighterAppearance | null = null;
  private lastFacing: 1 | -1 | 0 = 0;
  private lastFrameIndex = -1;
  private lastFrameAnimation: FighterAnimation | null = null;

  constructor(readonly playerId: string) {
    super();
    this.addChild(this.sprite, this.accessoryLayer);
    this.sprite.anchor.set(0.5, 1);
    this.eventMode = "none";
    this.interactiveChildren = false;
  }

  async load(): Promise<void> {
    this.textures = await loadTextures();
    this.sheet = await Assets.load<Texture>(FIGHTER_SHEET_URL);
    this.sprite.texture = this.textures.idle[0];
  }

  showHit(time: number, direction: number, strength: number): void {
    this.hitStartedAt = time;
    this.hitUntil = Math.max(this.hitUntil, time + HIT_DURATION);
    this.hitDirection = direction || 1;
    this.hitStrength = Math.min(1.8, Math.max(0.8, strength));
    this.setAnimation("hit", time, true);
  }

  showKo(time: number): void {
    this.koUntil = Math.max(this.koUntil, time + KO_DURATION);
    this.setAnimation("ko", time, true);
  }

  showVoidDeath(time: number): void {
    this.hiddenUntil = Math.max(this.hiddenUntil, time + RESPAWN_HIDE_DURATION);
  }

  update(player: PlayerState, time: number): void {
    this.position.set(player.position.x, player.position.y);
    if (!this.textures) {
      this.visible = false;
      return;
    }
    const next = this.chooseAnimation(player, time);
    this.setAnimation(next, time);
    const frameIndex = this.frameIndex(time);
    this.setFrame(frameIndex);

    const definition = FIGHTER_ANIMATIONS[this.animation];
    const frame = definition.frames[frameIndex] ?? definition.frames[0];
    const scale = FIGHTER_VISUAL_HEIGHT / frame.height;

    this.sprite.scale.set(scale * player.facing, scale);
    this.sprite.position.set((frame.offsetX ?? 0) * scale * player.facing, frame.offsetY ?? 0);
    this.syncAppearance(player);
    this.applyHitMotion(time);
    this.zIndex = player.position.y
      + (player.attackState.type === "active" ? 1_000 : 0)
      + (time < this.hitUntil ? 1_100 : 0);
    this.alpha = player.invulnerableUntil > time && Math.floor(time * 12) % 2 === 0 ? 0.35 : 1;
    this.visible = time >= this.hiddenUntil && (player.lives > 0 || time < this.koUntil);
    this.wasGrounded = player.grounded;
  }

  private chooseAnimation(player: PlayerState, time: number): FighterAnimation {
    if (time < this.koUntil) return "ko";
    if (time < this.hitUntil) return "hit";
    if (player.attackState.type === "charging") return "slapCharge";
    if (player.attackState.type === "active") return "slapAttack";
    if (player.attackState.type === "recovery") return "slapRecovery";
    if (!this.wasGrounded && player.grounded) {
      this.setAnimation("land", time, true);
      return "land";
    }
    if (this.animation === "land" && time - this.animationStartedAt < LAND_DURATION) return "land";
    if (!player.grounded) return player.velocity.y < 30 ? "jump" : "fall";
    return Math.abs(player.velocity.x) >= RUN_THRESHOLD ? "run" : "idle";
  }

  private setAnimation(animation: FighterAnimation, time: number, restart = false): void {
    if (!restart && animation === this.animation) return;
    this.animation = animation;
    this.animationStartedAt = time;
    this.lastFrameIndex = -1;
  }

  private frameIndex(time: number): number {
    const definition = FIGHTER_ANIMATIONS[this.animation];
    const elapsedFrames = Math.max(0, Math.floor((time - this.animationStartedAt) * definition.fps));
    return definition.loop
      ? elapsedFrames % definition.frames.length
      : Math.min(elapsedFrames, definition.frames.length - 1);
  }

  private setFrame(index: number): void {
    if (index === this.lastFrameIndex && this.animation === this.lastFrameAnimation) return;
    this.lastFrameIndex = index;
    this.lastFrameAnimation = this.animation;
    this.sprite.texture = this.textures[this.animation][index];
  }

  private syncAppearance(player: PlayerState): void {
    const key = appearanceKey(player.avatar, player.spawnIndex);
    if (key !== this.appearanceCacheKey || !this.appearance) {
      this.appearanceCacheKey = key;
      this.appearance = appearanceFromAvatar(player.avatar, player.spawnIndex);
      this.setColorVariant(this.appearance.color);
      this.syncAccessories(this.appearance.accessories, player.facing);
      this.lastFacing = player.facing;
      return;
    }
    if (this.lastFacing !== player.facing) {
      this.lastFacing = player.facing;
      this.syncAccessories(this.appearance.accessories, player.facing);
    }
  }

  private setColorVariant(color: ReturnType<typeof appearanceFromAvatar>["color"]): void {
    if (color === this.colorKey) return;
    this.colorKey = color;
    const hue = colorHue(color);
    if (hue == null) {
      this.sprite.filters = null;
      return;
    }
    const filter = new ColorMatrixFilter();
    filter.hue(hue, false);
    filter.saturate(0.28, true);
    this.sprite.filters = [filter];
  }

  private syncAccessories(accessories: AccessorySprite[], facing: 1 | -1): void {
    if (!this.sheet) return;
    const seen = new Set<string>();
    for (const accessory of accessories) {
      seen.add(accessory.id);
      let sprite = this.accessorySprites.get(accessory.id);
      if (!sprite) {
        sprite = new Sprite(
          new Texture({
            source: this.sheet.source,
            frame: new Rectangle(
              accessory.frame.x,
              accessory.frame.y,
              accessory.frame.width,
              accessory.frame.height,
            ),
          }),
        );
        sprite.anchor.set(0.5, 1);
        this.accessoryLayer.addChild(sprite);
        this.accessorySprites.set(accessory.id, sprite);
      }
      const accessoryScale = 42 / accessory.frame.height;
      sprite.scale.set(accessoryScale * facing, accessoryScale);
      sprite.position.set(accessory.anchorX * facing, accessory.anchorY);
      sprite.visible = true;
    }
    for (const [id, sprite] of this.accessorySprites) {
      if (!seen.has(id)) sprite.visible = false;
    }
  }

  private applyHitMotion(time: number): void {
    if (time >= this.hitUntil) {
      if (this.rotation !== 0) this.rotation = 0;
      return;
    }
    const progress = Math.min(1, Math.max(0, (time - this.hitStartedAt) / HIT_DURATION));
    const decay = 1 - progress;
    const shake = Math.sin(progress * Math.PI * 7) * 7 * decay * this.hitStrength;
    this.x += shake * this.hitDirection;
    this.y -= Math.sin(progress * Math.PI) * 8 * this.hitStrength;
    this.rotation = -this.hitDirection * 0.08 * decay * this.hitStrength;
  }
}
