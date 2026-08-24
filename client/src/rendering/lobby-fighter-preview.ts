import { Application, BlurFilter } from "pixi.js";
import {
  emptyAvatar,
  PRIMARY_ATTACK_ID,
  type AvatarConfiguration,
  type PlayerState,
} from "@tituah/shared";
import { FIGHTER_VISUAL_HEIGHT } from "./sprites/fighter-atlas.js";
import { FighterSprite } from "./sprites/fighter-sprite.js";
import { pixiOptions } from "./renderer-options.js";
import { audio } from "../audio/audio-manager.js";

const CHARGE_MS = 180;
const ATTACK_MS = 240;
const RECOVERY_MS = 180;
const PREVIEW_SCALE = 0.72;
const RUN_DEMO_MS = 2200;
const P2_RUN_MS = 780;
const P1_REVEAL_MS = 420;

export type LobbyDemoMove = "idle" | "run" | "jump" | "slap" | "hit";

type LayoutMode = "solo" | "matchmaking";

export class LobbyFighterPreview {
  private readonly app = new Application();
  private readonly localFighter = new FighterSprite("lobby-local");
  private readonly opponentFighter = new FighterSprite("lobby-opponent");
  private readonly ghostBlur = new BlurFilter({ strength: 6 });
  private readonly localPlayer = idlePlayer("lobby-local", 0);
  private opponentPlayer: PlayerState | null = null;
  private time = 0;
  private scale = 3;
  private ready = false;
  private loading = false;
  private seeking = false;
  private layoutMode: LayoutMode = "solo";
  private ghostOpponent = false;
  private opponentAlpha: number | null = null;
  private animating = false;
  private demoToken = 0;
  private resizeObserver?: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly lobby: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly platform: HTMLElement,
  ) {}

  async start(): Promise<void> {
    const width = Math.max(2, this.lobby.clientWidth);
    const height = Math.max(2, this.lobby.clientHeight);
    await this.app.init(pixiOptions(this.canvas, {
      width,
      height,
      backgroundAlpha: 0,
      autoStart: true,
    }));
    this.app.stage.eventMode = "none";
    this.app.stage.interactiveChildren = false;
    await Promise.all([this.localFighter.load(), this.opponentFighter.load()]);
    this.app.stage.addChild(this.localFighter, this.opponentFighter);
    this.opponentFighter.visible = false;
    this.ready = true;
    this.layout();
    this.app.ticker.add(() => {
      const dt = this.app.ticker.deltaMS / 1000;
      this.time += dt;
      if (
        (this.loading || this.seeking)
        && this.layoutMode === "matchmaking"
        && this.ghostOpponent
        && !this.animating
        && this.localPlayer.attackState.type !== "charging"
      ) {
        this.localPlayer.attackState = {
          type: "charging",
          attackId: PRIMARY_ATTACK_ID,
          startedAt: this.time,
        };
      }
      if (this.animating && Math.abs(this.localPlayer.velocity.x) > 1) {
        this.localPlayer.position.x += this.localPlayer.velocity.x * dt;
      }
      this.localFighter.update(this.localPlayer, this.time);
      this.localFighter.scale.set(this.scale);
      if (this.opponentPlayer) {
        this.opponentFighter.update(this.opponentPlayer, this.time);
        this.opponentFighter.scale.set(this.scale);
        if (this.opponentAlpha != null) this.opponentFighter.alpha = this.opponentAlpha;
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.lobby);
    this.resizeObserver.observe(this.stage);
    this.resizeObserver.observe(this.platform);
    window.visualViewport?.addEventListener("resize", () => this.layout());
  }

  setAvatar(avatar: AvatarConfiguration | null): void {
    this.localPlayer.avatar = avatar ? { ...avatar } : emptyAvatar();
  }

  setSpawnPreview(spawnIndex: 0 | 1): void {
    if (this.layoutMode === "matchmaking") return;
    this.localPlayer.spawnIndex = spawnIndex;
    // Edit preview only swaps P1/P2 tint — keep facing toward the options panel.
    this.localPlayer.facing = 1;
    this.layout();
  }

  setActive(active: boolean): void {
    this.app.ticker[active ? "start" : "stop"]();
    this.canvas.hidden = !active;
    if (!active) this.app.render();
    if (active) this.layout();
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.demoToken += 1;
    if (loading) {
      this.resetBody(this.localPlayer);
      this.localPlayer.attackState = {
        type: "charging",
        attackId: PRIMARY_ATTACK_ID,
        startedAt: this.time,
      };
      return;
    }
    if (!this.seeking && this.localPlayer.attackState.type === "charging") {
      this.localPlayer.attackState = { type: "idle" };
    }
  }

  setSeeking(seeking: boolean): void {
    this.seeking = seeking;
    this.demoToken += 1;
    if (seeking && this.ghostOpponent && !this.animating) {
      this.resetBody(this.localPlayer);
      this.localPlayer.attackState = {
        type: "charging",
        attackId: PRIMARY_ATTACK_ID,
        startedAt: this.time,
      };
      return;
    }
    if (!seeking && !this.loading && this.localPlayer.attackState.type === "charging") {
      this.localPlayer.attackState = { type: "idle" };
    }
  }

  /** P1 alone: expanded dual layout with blurred ghost on the right. */
  setWaitingGhost(local: PlayerState): void {
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "matchmaking";
    this.ghostOpponent = true;
    this.applyLocal(local, 0);
    this.localPlayer.facing = 1;
    this.localPlayer.attackState = {
      type: "charging",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
    };

    this.opponentPlayer = idlePlayer("lobby-ghost", 1);
    this.opponentPlayer.name = "Waiting";
    this.opponentPlayer.avatar = emptyAvatar();
    this.opponentPlayer.facing = -1;
    this.opponentFighter.visible = true;
    this.opponentAlpha = 0.38;
    this.opponentFighter.alpha = 0.38;
    this.opponentFighter.filters = [this.ghostBlur];
    this.layout();
  }

  /** P1: replace ghost with the real opponent. */
  revealOpponent(opponent: PlayerState): void {
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "matchmaking";
    this.ghostOpponent = false;
    this.localPlayer.attackState = { type: "idle" };
    this.localPlayer.facing = 1;
    this.localPlayer.spawnIndex = 0;

    this.opponentPlayer = idlePlayer(opponent.id, 1);
    this.opponentPlayer.name = opponent.name;
    this.opponentPlayer.avatar = { ...opponent.avatar };
    this.opponentPlayer.facing = -1;
    this.opponentFighter.visible = true;
    this.opponentAlpha = 1;
    this.opponentFighter.alpha = 1;
    this.opponentFighter.filters = null;
    this.layout();
  }

  /**
   * P2 join: start on the left (orange), run to the right, tint blue,
   * then reveal Player 1 on the left.
   */
  async enterAsPlayer2(local: PlayerState, opponent: PlayerState): Promise<void> {
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.layoutMode = "matchmaking";
    this.ghostOpponent = false;
    this.opponentAlpha = null;

    this.opponentPlayer = null;
    this.opponentFighter.visible = false;
    this.opponentFighter.alpha = 1;
    this.opponentFighter.filters = null;

    this.applyLocal(local, 0);
    this.localPlayer.facing = 1;
    this.localPlayer.attackState = { type: "idle" };
    this.animating = false;
    this.layout();
    if (token !== this.demoToken) return;

    this.animating = true;
    const { leftX, rightX, y } = this.lanePoints();
    this.localPlayer.position.x = leftX;
    this.localPlayer.position.y = y;
    this.localPlayer.velocity.x = (rightX - leftX) / (P2_RUN_MS / 1000);
    this.localPlayer.facing = 1;
    audio.playLoop("run");

    await wait(P2_RUN_MS);
    audio.stop("run");
    if (token !== this.demoToken) return;

    this.localPlayer.velocity.x = 0;
    this.localPlayer.position.x = rightX;
    this.localPlayer.spawnIndex = 1;
    this.localPlayer.facing = -1;
    this.localPlayer.avatar = { ...local.avatar };
    await wait(160);
    if (token !== this.demoToken) return;

    this.opponentPlayer = idlePlayer(opponent.id, 0);
    this.opponentPlayer.name = opponent.name;
    this.opponentPlayer.avatar = { ...opponent.avatar };
    this.opponentPlayer.facing = 1;
    this.opponentPlayer.position.x = leftX;
    this.opponentPlayer.position.y = y;
    this.opponentFighter.visible = true;
    this.opponentAlpha = 0;
    this.opponentFighter.alpha = 0;
    this.opponentFighter.filters = null;

    const revealStarted = performance.now();
    while (performance.now() - revealStarted < P1_REVEAL_MS) {
      if (token !== this.demoToken) return;
      const t = (performance.now() - revealStarted) / P1_REVEAL_MS;
      this.opponentAlpha = Math.min(1, t);
      await wait(16);
    }
    if (token !== this.demoToken) return;
    this.opponentAlpha = 1;
    this.opponentFighter.alpha = 1;
    this.animating = false;
    this.layout();
  }

  clearRoster(): void {
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "solo";
    this.ghostOpponent = false;
    this.opponentAlpha = null;
    this.opponentPlayer = null;
    this.opponentFighter.visible = false;
    this.opponentFighter.alpha = 1;
    this.opponentFighter.filters = null;
    this.localPlayer.spawnIndex = 0;
    this.localPlayer.facing = 1;
    this.localPlayer.velocity.x = 0;
    this.localPlayer.attackState = { type: "idle" };
    audio.stop("run");
    this.layout();
  }

  playMove(move: LobbyDemoMove): void {
    if (!this.ready || this.loading || this.seeking || this.layoutMode === "matchmaking") return;
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.resetBody(this.localPlayer);
    if (move !== "run") audio.stop("run");
    if (move === "idle") return;
    if (move === "run") void this.playRun(token);
    if (move === "jump") void this.playJump(token);
    if (move === "slap") void this.playSlapInPlace(token);
    if (move === "hit") {
      audio.play("hit");
      this.localFighter.showHit(this.time, 1, 1);
    }
  }

  /** In-place slap that resolves when the animation finishes (facing unchanged). */
  async slapInPlace(): Promise<void> {
    if (!this.ready || this.loading || this.seeking || this.layoutMode === "matchmaking") return;
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.resetBody(this.localPlayer);
    this.localPlayer.facing = 1;
    await this.playSlapInPlace(token);
  }

  async slap(target: HTMLElement, onHit?: () => void): Promise<number> {
    if (!this.ready || this.loading || this.seeking || this.layoutMode === "matchmaking") return 0;
    this.demoToken += 1;
    this.resetBody(this.localPlayer);
    this.layout();
    const origin = this.canvas.getBoundingClientRect();
    const hit = target.getBoundingClientRect();
    const targetX = hit.left + hit.width / 2 - origin.left;
    this.localPlayer.facing = targetX >= this.localPlayer.position.x ? 1 : -1;

    await this.playSlapInPlace(this.demoToken, target, onHit);
    return CHARGE_MS + ATTACK_MS + RECOVERY_MS;
  }

  layout(): void {
    if (!this.ready || this.animating) return;
    const lobby = this.lobby.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const platform = this.platform.getBoundingClientRect();
    if (lobby.width < 2 || lobby.height < 2) return;

    const width = Math.max(2, Math.round(lobby.width));
    const height = Math.max(2, Math.round(lobby.height));
    this.canvas.style.left = "0px";
    this.canvas.style.top = "0px";
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.app.renderer.resize(width, height);

    const stageTop = Math.max(stage.top, lobby.top);
    const feetY = Math.min(platform.top, lobby.bottom - 8);
    const available = Math.max(64, feetY - stageTop - 8);
    const dual = this.layoutMode === "matchmaking";
    this.scale = PREVIEW_SCALE * (available / FIGHTER_VISUAL_HEIGHT) * (dual ? 0.9 : 1);
    const { leftX, rightX, centerX, y } = this.lanePoints();

    if (dual) {
      const localIsP1 = this.localPlayer.spawnIndex === 0;
      this.localPlayer.position.x = localIsP1 ? leftX : rightX;
      this.localPlayer.position.y = y;
      this.localPlayer.facing = localIsP1 ? 1 : -1;
      if (this.opponentPlayer) {
        this.opponentPlayer.position.x = localIsP1 ? rightX : leftX;
        this.opponentPlayer.position.y = y;
        this.opponentPlayer.facing = localIsP1 ? -1 : 1;
      }
    } else {
      this.localPlayer.position.x = centerX;
      this.localPlayer.position.y = y;
    }
  }

  private lanePoints(): { leftX: number; rightX: number; centerX: number; y: number } {
    const lobby = this.lobby.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const platform = this.platform.getBoundingClientRect();
    const stageLeft = stage.left - lobby.left;
    const stageWidth = stage.width;
    const feetY = Math.min(platform.top, lobby.bottom - 8);
    return {
      leftX: stageLeft + stageWidth * 0.28,
      rightX: stageLeft + stageWidth * 0.72,
      centerX: stageLeft + stageWidth / 2,
      y: feetY - lobby.top,
    };
  }

  private applyLocal(local: PlayerState, spawnIndex: number): void {
    this.localPlayer.id = local.id;
    this.localPlayer.name = local.name;
    this.localPlayer.avatar = { ...local.avatar };
    this.localPlayer.spawnIndex = spawnIndex;
  }

  private resetBody(player: PlayerState): void {
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.grounded = true;
    player.attackState = { type: "idle" };
    this.layout();
  }

  private async playRun(token: number): Promise<void> {
    audio.playLoop("run");
    this.localPlayer.velocity.x = 40;
    this.localPlayer.facing = 1;
    await wait(RUN_DEMO_MS / 2);
    if (token !== this.demoToken) return;
    this.localPlayer.facing = -1;
    await wait(RUN_DEMO_MS / 2);
    if (token !== this.demoToken) return;
    audio.stop("run");
    this.resetBody(this.localPlayer);
  }

  private async playJump(token: number): Promise<void> {
    audio.play("jump");
    const baseY = this.localPlayer.position.y;
    this.localPlayer.grounded = false;
    this.localPlayer.velocity.y = -20;
    this.localPlayer.position.y = baseY - 36;
    await wait(280);
    if (token !== this.demoToken) return;
    this.localPlayer.velocity.y = 50;
    this.localPlayer.position.y = baseY - 12;
    await wait(180);
    if (token !== this.demoToken) return;
    this.localPlayer.grounded = true;
    this.localPlayer.velocity.y = 0;
    this.localPlayer.position.y = baseY;
    audio.play("land");
  }

  private async playSlapInPlace(
    token: number,
    target?: HTMLElement,
    onHit?: () => void,
  ): Promise<void> {
    this.localPlayer.attackState = {
      type: "charging",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
    };
    audio.play("slapCharge");
    await wait(CHARGE_MS);
    if (token !== this.demoToken) {
      audio.stop("slapCharge");
      return;
    }

    this.localPlayer.attackState = {
      type: "active",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
      charge: 0.6,
    };
    audio.stop("slapCharge");
    audio.play("slapSwing");
    audio.play("uiSlap");
    target?.classList.add("is-hit");
    const hitWork = Promise.resolve(onHit?.());
    await wait(ATTACK_MS);
    if (token !== this.demoToken) {
      target?.classList.remove("is-hit");
      await hitWork;
      return;
    }

    this.localPlayer.attackState = {
      type: "recovery",
      attackId: PRIMARY_ATTACK_ID,
      endsAt: this.time + RECOVERY_MS / 1000,
    };
    await wait(RECOVERY_MS);
    target?.classList.remove("is-hit");
    await hitWork;
    if (token !== this.demoToken || this.loading || this.seeking) return;
    this.localPlayer.attackState = { type: "idle" };
  }
}

function idlePlayer(id: string, spawnIndex: number): PlayerState {
  return {
    id,
    name: "Fighter",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: spawnIndex === 0 ? 1 : -1,
    grounded: true,
    jumpsRemaining: 2,
    health: 100,
    damagePercent: 0,
    attackState: { type: "idle" },
    lives: 1,
    lastInputSeq: 0,
    spawnIndex,
    invulnerableUntil: 0,
    avatar: emptyAvatar(),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
