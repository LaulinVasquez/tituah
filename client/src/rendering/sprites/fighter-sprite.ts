import { Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { PlayerState } from "@tituah/shared";
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
  private colorVariant = -1;

  constructor(readonly playerId: string) {
    super();
    this.addChild(this.sprite);
    this.sprite.anchor.set(0.5, 1);
  }

  async load(): Promise<void> {
    this.textures = await loadTextures();
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
    this.setFrame(time);

    const definition = FIGHTER_ANIMATIONS[this.animation];
    const frameIndex = this.frameIndex(time);
    const frame = definition.frames[frameIndex] ?? definition.frames[0];
    const scale = FIGHTER_VISUAL_HEIGHT / frame.height;

    this.sprite.scale.set(scale * player.facing, scale);
    this.sprite.position.set((frame.offsetX ?? 0) * scale * player.facing, frame.offsetY ?? 0);
    this.setColorVariant(player.spawnIndex);
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
  }

  private frameIndex(time: number): number {
    const definition = FIGHTER_ANIMATIONS[this.animation];
    const elapsedFrames = Math.max(0, Math.floor((time - this.animationStartedAt) * definition.fps));
    return definition.loop
      ? elapsedFrames % definition.frames.length
      : Math.min(elapsedFrames, definition.frames.length - 1);
  }

  private setFrame(time: number): void {
    this.sprite.texture = this.textures[this.animation][this.frameIndex(time)];
  }

  private setColorVariant(spawnIndex: number): void {
    const variant = spawnIndex % 2;
    if (variant === this.colorVariant) return;
    this.colorVariant = variant;
    if (variant === 0) {
      this.sprite.filters = [];
      return;
    }
    const blue = new ColorMatrixFilter();
    blue.hue(190, false);
    blue.saturate(0.35, true);
    this.sprite.filters = [blue];
  }

  private applyHitMotion(time: number): void {
    if (time >= this.hitUntil) {
      this.rotation = 0;
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
