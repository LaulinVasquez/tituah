import { Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { throwableIdFromAvatar, type PlayerState, type ThrowableId } from "@tituah/shared";
import { appearanceFromAvatar, appearanceKey, colorHue, type FighterAppearance } from "./appearance.js";
import {
  FIGHTER_ANIMATIONS,
  FIGHTER_SHEET_URL,
  FIGHTER_VISUAL_HEIGHT,
  THREE_SLAPS_SHEET_URL,
  RUNNING_SHEET_URL,
  THROW_SHEET_URL,
  type FighterAnimation,
  type FighterFrame,
} from "./fighter-atlas.js";
import {
  THROWABLE_OVERLAY_SCALE,
  THROW_HAND_ANCHORS,
  loadThrowableTextures,
  throwableCrop,
  type ThrowableOverlayFrame,
} from "./throwable-atlas.js";

const RUN_THRESHOLD = 24;
const LAND_DURATION = 0.2;
const HIT_DURATION = 0.38;
const KO_DURATION = 0.65;
const RESPAWN_HIDE_DURATION = 0.52;
const THROW_CLIP_DURATION =
  FIGHTER_ANIMATIONS.throw.frames.length / FIGHTER_ANIMATIONS.throw.fps;

let texturePromise: Promise<Record<FighterAnimation, Texture[]>> | null = null;

function loadTextures(): Promise<Record<FighterAnimation, Texture[]>> {
  if (texturePromise) return texturePromise;
  texturePromise = Promise.all([
    Assets.load<Texture>(FIGHTER_SHEET_URL),
    Assets.load<Texture>(RUNNING_SHEET_URL),
    Assets.load<Texture>(THREE_SLAPS_SHEET_URL),
    Assets.load<Texture>(THROW_SHEET_URL),
  ]).then(([fighterSheet, runningSheet, threeSlapSheet, throwSheet]) => {
    const result = {} as Record<FighterAnimation, Texture[]>;
    for (const [name, animation] of Object.entries(FIGHTER_ANIMATIONS)) {
      const sheet =
        animation.sheet === "running"
          ? runningSheet
          : animation.sheet === "threeSlap"
            ? threeSlapSheet
            : animation.sheet === "throw"
              ? throwSheet
              : fighterSheet;
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
  private readonly throwableOverlay = new Sprite();
  private textures!: Record<FighterAnimation, Texture[]>;
  private throwableTextures: Record<ThrowableId, Texture[]> | null = null;
  private animation: FighterAnimation = "idle";
  private animationStartedAt = 0;
  private wasGrounded = true;
  private hitUntil = 0;
  private hitStartedAt = 0;
  private hitDirection = 1;
  private hitStrength = 1;
  private koUntil = 0;
  private koHoldFrame = false;
  private hiddenUntil = 0;
  private colorKey = "";
  private appearanceCacheKey = "";
  private appearance: FighterAppearance | null = null;
  private throwableId: ThrowableId = "sandal";
  private lastFrameIndex = -1;
  private lastFrameAnimation: FighterAnimation | null = null;
  private lastActiveSlapStartedAt = -1;
  /** `throwAnimUntil` value currently being played (or last finished). */
  private throwAnimKey = 0;
  /** Local playhead end — clip always runs from frame 0 for this duration. */
  private throwPlayEndsAt = 0;

  constructor(readonly playerId: string) {
    super();
    this.addChild(this.sprite);
    this.addChild(this.throwableOverlay);
    this.sprite.anchor.set(0.5, 1);
    this.throwableOverlay.visible = false;
    this.throwableOverlay.eventMode = "none";
    this.eventMode = "none";
    this.interactiveChildren = false;
  }

  async load(): Promise<void> {
    const [textures, throwables] = await Promise.all([loadTextures(), loadThrowableTextures()]);
    this.textures = textures;
    this.throwableTextures = throwables;
    this.sprite.texture = this.textures.idle[0];
  }

  showHit(time: number, direction: number, strength: number): void {
    this.hitStartedAt = time;
    this.hitUntil = Math.max(this.hitUntil, time + HIT_DURATION);
    this.hitDirection = direction || 1;
    this.hitStrength = Math.min(1.8, Math.max(0.8, strength));
    this.setAnimation("hit", time, true);
  }

  showKo(time: number, holdLastFrame = false): void {
    this.koHoldFrame = holdLastFrame;
    this.koUntil = Math.max(this.koUntil, time + KO_DURATION);
    this.setAnimation("ko", time, true);
  }

  showVoidDeath(time: number): void {
    this.hiddenUntil = Math.max(this.hiddenUntil, time + RESPAWN_HIDE_DURATION);
  }

  debugState(): {
    playerId: string;
    hiddenUntil: number;
    koUntil: number;
    animationStartedAt: number;
    animation: FighterAnimation;
    visible: boolean;
  } {
    return {
      playerId: this.playerId,
      hiddenUntil: this.hiddenUntil,
      koUntil: this.koUntil,
      animationStartedAt: this.animationStartedAt,
      animation: this.animation,
      visible: this.visible,
    };
  }

  resetForMatch(): void {
    this.hiddenUntil = 0;
    this.koUntil = 0;
    this.koHoldFrame = false;
    this.hitUntil = 0;
    this.hitStartedAt = 0;
    this.animationStartedAt = 0;
    this.lastFrameIndex = -1;
    this.lastFrameAnimation = null;
    this.lastActiveSlapStartedAt = -1;
    this.throwAnimKey = 0;
    this.throwPlayEndsAt = 0;
    this.wasGrounded = true;
    this.animation = "idle";
    this.throwableOverlay.visible = false;
    this.visible = true;
    this.alpha = 1;
    this.rotation = 0;
  }

  update(player: PlayerState, time: number): void {
    this.position.set(player.position.x, player.position.y);
    if (!this.textures) {
      this.visible = false;
      return;
    }

    const throwing = this.syncThrowRelease(player, time);
    const next = throwing ? "throw" : this.chooseAnimation(player, time);

    if (player.attackState.type === "combo") {
      this.setAnimation("runSlapCombo", player.attackState.startedAt, true);
    } else if (player.attackState.type === "active") {
      const startedAt = player.attackState.startedAt;
      this.setAnimation("slapAttack", startedAt, startedAt !== this.lastActiveSlapStartedAt);
      this.lastActiveSlapStartedAt = startedAt;
    } else if (throwing) {
      this.lastActiveSlapStartedAt = -1;
      // Animation start time is owned by syncThrowRelease.
    } else {
      this.lastActiveSlapStartedAt = -1;
      // Only force-restart when leaving throw; never reset slapCharge every frame.
      this.setAnimation(next, time, this.animation === "throw");
    }

    const frameIndex = this.frameIndex(time);
    const definition = FIGHTER_ANIMATIONS[this.animation];
    const frame = definition.frames[frameIndex] ?? definition.frames[0];
    const scale = FIGHTER_VISUAL_HEIGHT / frame.height;

    this.syncAppearance(player);
    this.setFrame(frameIndex, frame, scale, player.facing);
    this.syncThrowableOverlay(frameIndex, scale, player.facing);
    this.applyHitMotion(time);
    this.zIndex = player.position.y
      + (player.attackState.type === "active" || player.attackState.type === "combo" ? 1_000 : 0)
      + (throwing ? 1_050 : 0)
      + (time < this.hitUntil ? 1_100 : 0);
    this.alpha = player.invulnerableUntil > time && Math.floor(time * 12) % 2 === 0 ? 0.35 : 1;
    this.visible = time >= this.hiddenUntil
      && (player.lives > 0 || time < this.koUntil || this.koHoldFrame);
    this.wasGrounded = player.grounded;
  }

  /** Plays the 3-frame throw clip once from frame 0, keyed by throwAnimUntil. */
  private syncThrowRelease(player: PlayerState, time: number): boolean {
    const until = player.throwAnimUntil ?? 0;

    if (until > 0 && until !== this.throwAnimKey) {
      this.throwAnimKey = until;
      this.throwPlayEndsAt = time + THROW_CLIP_DURATION;
      this.setAnimation("throw", time, true);
      return true;
    }

    if (this.throwPlayEndsAt > 0) {
      if (time < this.throwPlayEndsAt) {
        if (this.animation !== "throw") {
          const startedAt = this.throwPlayEndsAt - THROW_CLIP_DURATION;
          this.setAnimation("throw", startedAt, true);
        }
        return true;
      }
      this.throwPlayEndsAt = 0;
    }

    return false;
  }

  private chooseAnimation(player: PlayerState, time: number): FighterAnimation {
    if (this.koHoldFrame || time < this.koUntil) return "ko";
    if (time < this.hitUntil) return "hit";
    if (player.attackState.type === "combo") return "runSlapCombo";
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

  private setFrame(index: number, frame: FighterFrame, scale: number, facing: 1 | -1): void {
    const sameFrame = index === this.lastFrameIndex && this.animation === this.lastFrameAnimation;
    if (!sameFrame) {
      this.sprite.texture = this.textures[this.animation][index];
    }
    this.lastFrameIndex = index;
    this.lastFrameAnimation = this.animation;

    this.sprite.scale.set(scale * facing, scale);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.position.set((frame.offsetX ?? 0) * scale * facing, frame.offsetY ?? 0);
    this.setColorVariant(this.appearance?.color ?? "orange");
  }

  private syncThrowableOverlay(
    frameIndex: number,
    scale: number,
    facing: 1 | -1,
  ): void {
    if (!this.throwableTextures) {
      this.throwableOverlay.visible = false;
      return;
    }

    if (this.animation === "throw" && frameIndex <= 1) {
      const overlayFrame = frameIndex as ThrowableOverlayFrame;
      const crop = throwableCrop(this.throwableId, overlayFrame);
      const hand = THROW_HAND_ANCHORS[overlayFrame];
      const overlayScale = scale * THROWABLE_OVERLAY_SCALE;
      this.throwableOverlay.texture = this.throwableTextures[this.throwableId][overlayFrame];
      this.throwableOverlay.anchor.set(crop.gripX, crop.gripY);
      this.throwableOverlay.scale.set(overlayScale * facing, overlayScale);
      this.throwableOverlay.position.set(
        this.sprite.position.x + hand.offsetX * scale * facing,
        this.sprite.position.y + hand.offsetY * scale,
      );
      this.throwableOverlay.visible = true;
      return;
    }

    this.throwableOverlay.visible = false;
  }

  private syncAppearance(player: PlayerState): void {
    const key = appearanceKey(player.avatar);
    if (key === this.appearanceCacheKey && this.appearance) return;
    this.appearanceCacheKey = key;
    this.appearance = appearanceFromAvatar(player.avatar);
    this.throwableId = throwableIdFromAvatar(player.avatar?.throwableId);
    this.lastFrameIndex = -1;
    this.lastFrameAnimation = null;
  }

  private setColorVariant(color: NonNullable<FighterAppearance>["color"]): void {
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
