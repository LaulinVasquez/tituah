import { Application } from "pixi.js";
import {
  emptyAvatar,
  PRIMARY_ATTACK_ID,
  type AvatarConfiguration,
  type PlayerState,
} from "@tituah/shared";
import { FIGHTER_VISUAL_HEIGHT } from "./sprites/fighter-atlas.js";
import { FighterSprite } from "./sprites/fighter-sprite.js";
import { pixiOptions } from "./renderer-options.js";

const CHARGE_MS = 180;
const ATTACK_MS = 240;
const RECOVERY_MS = 180;
const PREVIEW_SCALE = 0.72;
const RUN_DEMO_MS = 2200;

export type LobbyDemoMove = "idle" | "run" | "jump" | "slap" | "hit";

export class LobbyFighterPreview {
  private readonly app = new Application();
  private readonly fighter = new FighterSprite("lobby");
  private readonly player = idlePlayer();
  private time = 0;
  private scale = 3;
  private ready = false;
  private loading = false;
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
    await this.fighter.load();
    this.app.stage.addChild(this.fighter);
    this.ready = true;
    this.layout();
    this.app.ticker.add(() => {
      this.time += this.app.ticker.deltaMS / 1000;
      if (this.loading && this.player.attackState.type !== "charging") {
        this.player.attackState = {
          type: "charging",
          attackId: PRIMARY_ATTACK_ID,
          startedAt: this.time,
        };
      }
      this.fighter.update(this.player, this.time);
      this.fighter.scale.set(this.scale);
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.lobby);
  }

  setAvatar(avatar: AvatarConfiguration | null): void {
    this.player.avatar = avatar ? { ...avatar } : emptyAvatar();
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
      this.resetBody();
      this.player.attackState = {
        type: "charging",
        attackId: PRIMARY_ATTACK_ID,
        startedAt: this.time,
      };
      return;
    }
    if (this.player.attackState.type === "charging") {
      this.player.attackState = { type: "idle" };
    }
  }

  playMove(move: LobbyDemoMove): void {
    if (!this.ready || this.loading) return;
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.resetBody();
    if (move === "idle") return;
    if (move === "run") void this.playRun(token);
    if (move === "jump") void this.playJump(token);
    if (move === "slap") void this.playSlapInPlace(token);
    if (move === "hit") this.fighter.showHit(this.time, 1, 1);
  }

  async slap(target: HTMLElement, onHit?: () => void): Promise<number> {
    if (!this.ready || this.loading) return 0;
    this.demoToken += 1;
    this.resetBody();
    this.layout();
    const origin = this.canvas.getBoundingClientRect();
    const hit = target.getBoundingClientRect();
    const targetX = hit.left + hit.width / 2 - origin.left;
    this.player.facing = targetX >= this.player.position.x ? 1 : -1;

    await this.playSlapInPlace(this.demoToken, target, onHit);
    return CHARGE_MS + ATTACK_MS + RECOVERY_MS;
  }

  layout(): void {
    if (!this.ready) return;
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

    const available = Math.max(110, platform.top - stage.top - 8);
    this.scale = PREVIEW_SCALE * (available / FIGHTER_VISUAL_HEIGHT);
    this.player.position.x = stage.left + stage.width / 2 - lobby.left;
    this.player.position.y = platform.top - lobby.top;
  }

  private resetBody(): void {
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    this.player.grounded = true;
    this.player.attackState = { type: "idle" };
    this.layout();
  }

  private async playRun(token: number): Promise<void> {
    this.player.velocity.x = 40;
    this.player.facing = 1;
    await wait(RUN_DEMO_MS / 2);
    if (token !== this.demoToken) return;
    this.player.facing = -1;
    await wait(RUN_DEMO_MS / 2);
    if (token !== this.demoToken) return;
    this.resetBody();
  }

  private async playJump(token: number): Promise<void> {
    const baseY = this.player.position.y;
    this.player.grounded = false;
    this.player.velocity.y = -20;
    this.player.position.y = baseY - 36;
    await wait(280);
    if (token !== this.demoToken) return;
    this.player.velocity.y = 50;
    this.player.position.y = baseY - 12;
    await wait(180);
    if (token !== this.demoToken) return;
    this.player.grounded = true;
    this.player.velocity.y = 0;
    this.player.position.y = baseY;
  }

  private async playSlapInPlace(
    token: number,
    target?: HTMLElement,
    onHit?: () => void,
  ): Promise<void> {
    this.player.attackState = {
      type: "charging",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
    };
    await wait(CHARGE_MS);
    if (token !== this.demoToken) return;

    this.player.attackState = {
      type: "active",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
      charge: 0.6,
    };
    target?.classList.add("is-hit");
    const hitWork = Promise.resolve(onHit?.());
    await wait(ATTACK_MS);
    if (token !== this.demoToken) {
      target?.classList.remove("is-hit");
      await hitWork;
      return;
    }

    this.player.attackState = {
      type: "recovery",
      attackId: PRIMARY_ATTACK_ID,
      endsAt: this.time + RECOVERY_MS / 1000,
    };
    await wait(RECOVERY_MS);
    target?.classList.remove("is-hit");
    await hitWork;
    if (token !== this.demoToken || this.loading) return;
    this.player.attackState = { type: "idle" };
  }
}

function idlePlayer(): PlayerState {
  return {
    id: "lobby",
    name: "Fighter",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 1,
    grounded: true,
    jumpsRemaining: 2,
    health: 100,
    damagePercent: 0,
    attackState: { type: "idle" },
    lives: 1,
    lastInputSeq: 0,
    spawnIndex: 0,
    invulnerableUntil: 0,
    avatar: emptyAvatar(),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
