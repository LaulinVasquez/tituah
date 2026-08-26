import { Application, BlurFilter } from "pixi.js";
import {
  emptyAvatar,
  PRIMARY_ATTACK_ID,
  type AvatarConfiguration,
  type PlayerCount,
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
const JOIN_RUN_MS = 780;
const REVEAL_MS = 420;

export type LobbyDemoMove = "idle" | "run" | "jump" | "slap" | "hit";

export type PodiumStatus = "ready" | "pending" | "left";

export type PodiumStand = {
  place: number;
  player: PlayerState | null;
  status: PodiumStatus;
};

type LayoutMode = "solo" | "matchmaking";

export class LobbyFighterPreview {
  private readonly app = new Application();
  private readonly fighters = [0, 1, 2, 3].map((slot) => new FighterSprite(`lobby-${slot}`));
  private readonly ghostBlur = new BlurFilter({ strength: 6 });
  private readonly localPlayer = idlePlayer("lobby-local", 0);
  private readonly slotPlayers: (PlayerState | null)[] = [null, null, null, null];
  private readonly extraPlatforms: HTMLElement[];
  private readonly extraPlatformRoot: HTMLElement | null;
  private readonly playerCard: HTMLElement | null;
  private time = 0;
  private scale = 3;
  private ready = false;
  private loading = false;
  private seeking = false;
  private layoutMode: LayoutMode = "solo";
  private maxSlots: PlayerCount = 2;
  private localSlot = 0;
  private ghostSlots = new Set<number>();
  private blurredSlots = new Set<number>();
  private podiumMode = false;
  private podiumKoShown = false;
  private podiumWinnerJump = false;
  private podiumLoserKo = false;
  private podiumInputBound = false;
  private animating = false;
  private demoToken = 0;
  private resizeObserver?: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly lobby: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly platform: HTMLElement,
  ) {
    this.extraPlatformRoot = document.querySelector("#extra-platforms");
    this.extraPlatforms = [...(this.extraPlatformRoot?.querySelectorAll<HTMLElement>(".podium-slot") ?? [])];
    this.playerCard = document.querySelector("#player-card");
  }

  private get localFighter(): FighterSprite {
    return this.fighters[0];
  }

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
    await Promise.all(this.fighters.map((fighter) => fighter.load()));
    for (const fighter of this.fighters) {
      fighter.visible = false;
      this.app.stage.addChild(fighter);
    }
    this.localFighter.visible = true;
    this.ready = true;
    this.layout();
    this.app.ticker.add(() => {
      const dt = this.app.ticker.deltaMS / 1000;
      this.time += dt;
      const waitingGhosts = this.layoutMode === "matchmaking" && this.ghostSlots.size > 0;
      if (
        (this.loading || this.seeking)
        && waitingGhosts
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
      if (this.layoutMode === "solo") {
        this.localFighter.visible = true;
        this.localFighter.update(this.localPlayer, this.time);
        this.localFighter.scale.set(this.scale);
        for (let slot = 1; slot < this.fighters.length; slot += 1) {
          this.fighters[slot].visible = false;
        }
        return;
      }
      for (let slot = 0; slot < this.fighters.length; slot += 1) {
        const fighter = this.fighters[slot];
        if (slot >= this.maxSlots) {
          fighter.visible = false;
          continue;
        }
        const player = slot === this.localSlot ? this.localPlayer : this.slotPlayers[slot];
        if (!player) {
          fighter.visible = false;
          continue;
        }
        fighter.visible = true;
        fighter.update(player, this.time);
        fighter.scale.set(this.scale);
        if (this.ghostSlots.has(slot)) {
          fighter.alpha = 0.38;
          fighter.filters = [this.ghostBlur];
        } else if (this.blurredSlots.has(slot)) {
          fighter.alpha = 0.5;
          fighter.filters = [this.ghostBlur];
        } else {
          fighter.alpha = 1;
          fighter.filters = null;
        }
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.lobby);
    this.resizeObserver.observe(this.stage);
    this.resizeObserver.observe(this.platform);
    window.visualViewport?.addEventListener("resize", () => this.layout());
    this.onPodiumKeyDown = this.onPodiumKeyDown.bind(this);
    this.onPodiumPointerDown = this.onPodiumPointerDown.bind(this);
  }

  private onPodiumKeyDown(event: KeyboardEvent): void {
    if (!this.podiumWinnerJump && !this.podiumLoserKo) return;
    if (event.code !== "Space" && event.code !== "ArrowUp") return;
    event.preventDefault();
    this.handlePodiumAction();
  }

  private onPodiumPointerDown(event: PointerEvent): void {
    if (!this.podiumWinnerJump && !this.podiumLoserKo) return;
    if ((event.target as HTMLElement).closest("button")) return;
    this.handlePodiumAction();
  }

  private handlePodiumAction(): void {
    if (this.podiumWinnerJump) {
      void this.jump();
      return;
    }
    if (this.podiumLoserKo) this.replayPodiumKo();
  }

  private replayPodiumKo(): void {
    const fighter = this.fighters[this.localSlot];
    if (!fighter) return;
    fighter.showKo(this.time, true);
    audio.play("ko");
  }

  private bindPodiumInput(): void {
    if (this.podiumInputBound) return;
    this.podiumInputBound = true;
    window.addEventListener("keydown", this.onPodiumKeyDown);
    this.lobby.addEventListener("pointerdown", this.onPodiumPointerDown);
  }

  private unbindPodiumInput(): void {
    if (!this.podiumInputBound) return;
    this.podiumInputBound = false;
    window.removeEventListener("keydown", this.onPodiumKeyDown);
    this.lobby.removeEventListener("pointerdown", this.onPodiumPointerDown);
  }

  private clearPodiumCelebration(): void {
    this.podiumKoShown = false;
    this.podiumWinnerJump = false;
    this.podiumLoserKo = false;
    this.unbindPodiumInput();
  }

  setAvatar(avatar: AvatarConfiguration | null): void {
    this.localPlayer.avatar = avatar ? { ...avatar } : emptyAvatar();
  }

  setSpawnPreview(spawnIndex: 0 | 1): void {
    if (this.layoutMode === "matchmaking") return;
    this.localPlayer.spawnIndex = spawnIndex;
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
    if (seeking && this.ghostSlots.size > 0 && !this.animating) {
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

  setWaitingRoster(local: PlayerState, maxPlayers: PlayerCount): void {
    this.clearPodiumCelebration();
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "matchmaking";
    this.podiumMode = false;
    this.maxSlots = maxPlayers;
    this.localSlot = clampSlot(local.spawnIndex, maxPlayers);
    this.applyLocal(local, this.localSlot);
    this.localPlayer.facing = this.localSlot % 2 === 0 ? 1 : -1;
    this.localPlayer.attackState = {
      type: "charging",
      attackId: PRIMARY_ATTACK_ID,
      startedAt: this.time,
    };
    this.ghostSlots.clear();
    this.blurredSlots.clear();
    for (let slot = 0; slot < 4; slot += 1) {
      if (slot >= maxPlayers) {
        this.slotPlayers[slot] = null;
        continue;
      }
      if (slot === this.localSlot) {
        this.slotPlayers[slot] = this.localPlayer;
        continue;
      }
      const ghost = idlePlayer(`lobby-ghost-${slot}`, slot);
      ghost.name = "Waiting";
      ghost.facing = slot % 2 === 0 ? 1 : -1;
      this.slotPlayers[slot] = ghost;
      this.ghostSlots.add(slot);
    }
    this.layout();
  }

  setRematchRoster(
    local: PlayerState,
    stands: PodiumStand[],
    maxPlayers: PlayerCount,
    winnerId: string | null,
  ): void {
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "matchmaking";
    this.podiumMode = true;
    this.maxSlots = maxPlayers;
    this.ghostSlots.clear();
    this.blurredSlots.clear();

    const localIndex = stands.findIndex((stand) => stand.player?.id === local.id);
    this.localSlot = localIndex >= 0 ? localIndex : clampSlot(local.spawnIndex, maxPlayers);
    this.applyLocal(local, this.localSlot);
    this.localPlayer.facing = this.localSlot % 2 === 0 ? 1 : -1;
    this.localPlayer.attackState = { type: "idle" };
    this.localPlayer.lives = 1;

    for (let slot = 0; slot < 4; slot += 1) {
      if (slot >= maxPlayers) {
        this.slotPlayers[slot] = null;
        continue;
      }
      const player = stands[slot]?.player ?? null;
      if (!player) {
        this.slotPlayers[slot] = null;
        continue;
      }
      if (slot === this.localSlot) {
        this.slotPlayers[slot] = this.localPlayer;
        continue;
      }
      const filled = idlePlayer(player.id, slot);
      filled.name = player.name;
      filled.avatar = { ...player.avatar };
      filled.facing = slot % 2 === 0 ? 1 : -1;
      filled.lives = 1;
      this.slotPlayers[slot] = filled;
    }

    if (!this.podiumKoShown) {
      for (const fighter of this.fighters) fighter.resetForMatch();
      for (let slot = 0; slot < maxPlayers; slot += 1) {
        const player = stands[slot]?.player ?? null;
        if (!player || !winnerId || player.id === winnerId) continue;
        this.fighters[slot].showKo(this.time, true);
      }
      this.podiumKoShown = true;
    }

    this.podiumWinnerJump = Boolean(winnerId && local.id === winnerId);
    this.podiumLoserKo = Boolean(winnerId && local.id !== winnerId);
    if (this.podiumWinnerJump || this.podiumLoserKo) this.bindPodiumInput();
    else this.unbindPodiumInput();

    this.layout();
  }

  revealPlayer(player: PlayerState): void {
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "matchmaking";
    const slot = clampSlot(player.spawnIndex, this.maxSlots);
    this.ghostSlots.delete(slot);
    this.blurredSlots.delete(slot);
    if (slot === this.localSlot) {
      this.applyLocal(player, slot);
      this.localPlayer.attackState = { type: "idle" };
    } else {
      const filled = idlePlayer(player.id, slot);
      filled.name = player.name;
      filled.avatar = { ...player.avatar };
      filled.facing = slot % 2 === 0 ? 1 : -1;
      this.slotPlayers[slot] = filled;
    }
    this.fighters[slot].alpha = 1;
    this.fighters[slot].filters = null;
    this.layout();
  }

  async enterAsJoiner(local: PlayerState, others: PlayerState[], maxPlayers: PlayerCount): Promise<void> {
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.layoutMode = "matchmaking";
    this.podiumMode = false;
    this.maxSlots = maxPlayers;
    this.localSlot = clampSlot(local.spawnIndex, maxPlayers);
    this.ghostSlots.clear();
    this.blurredSlots.clear();
    this.animating = false;

    for (let slot = 0; slot < 4; slot += 1) this.slotPlayers[slot] = null;
    for (const other of others) {
      const slot = clampSlot(other.spawnIndex, maxPlayers);
      const filled = idlePlayer(other.id, slot);
      filled.name = other.name;
      filled.avatar = { ...other.avatar };
      filled.facing = slot % 2 === 0 ? 1 : -1;
      this.slotPlayers[slot] = filled;
    }

    this.applyLocal(local, this.localSlot);
    this.localPlayer.facing = 1;
    this.localPlayer.attackState = { type: "idle" };
    this.layout();
    if (token !== this.demoToken) return;

    this.animating = true;
    const lanes = this.laneXs();
    const destX = lanes[this.localSlot] ?? lanes[0];
    const startX = lanes[0];
    this.localPlayer.position.x = startX;
    this.localPlayer.position.y = this.feetY();
    this.localPlayer.velocity.x = (destX - startX) / (JOIN_RUN_MS / 1000);
    audio.playLoop("run");
    await wait(JOIN_RUN_MS);
    audio.stop("run");
    if (token !== this.demoToken) return;

    this.localPlayer.velocity.x = 0;
    this.localPlayer.position.x = destX;
    this.applyLocal(local, this.localSlot);
    this.localPlayer.facing = this.localSlot % 2 === 0 ? 1 : -1;
    this.slotPlayers[this.localSlot] = this.localPlayer;

    for (const other of others) {
      const slot = clampSlot(other.spawnIndex, maxPlayers);
      this.fighters[slot].alpha = 0;
    }
    const revealStarted = performance.now();
    while (performance.now() - revealStarted < REVEAL_MS) {
      if (token !== this.demoToken) return;
      const t = (performance.now() - revealStarted) / REVEAL_MS;
      for (const other of others) {
        const slot = clampSlot(other.spawnIndex, maxPlayers);
        this.fighters[slot].alpha = Math.min(1, t);
      }
      await wait(16);
    }
    for (const other of others) {
      const slot = clampSlot(other.spawnIndex, maxPlayers);
      this.fighters[slot].alpha = 1;
    }
    this.animating = false;
    this.layout();
  }

  setWaitingGhost(local: PlayerState): void {
    this.setWaitingRoster(local, 2);
  }

  revealOpponent(opponent: PlayerState): void {
    this.revealPlayer(opponent);
  }

  async enterAsPlayer2(local: PlayerState, opponent: PlayerState): Promise<void> {
    await this.enterAsJoiner(local, [opponent], 2);
  }

  clearRoster(): void {
    this.clearPodiumCelebration();
    this.demoToken += 1;
    this.animating = false;
    this.layoutMode = "solo";
    this.podiumMode = false;
    this.maxSlots = 2;
    this.localSlot = 0;
    this.ghostSlots.clear();
    this.blurredSlots.clear();
    for (let slot = 0; slot < 4; slot += 1) this.slotPlayers[slot] = null;
    for (const fighter of this.fighters) {
      fighter.resetForMatch();
      fighter.alpha = 1;
      fighter.filters = null;
      fighter.visible = slotVisible(fighter, this.fighters[0]);
    }
    this.localFighter.visible = true;
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

  async slapInPlace(): Promise<void> {
    if (!this.ready || this.loading || this.seeking || this.layoutMode === "matchmaking") return;
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.resetBody(this.localPlayer);
    this.localPlayer.facing = 1;
    await this.playSlapInPlace(token);
  }

  async jump(onApex?: () => void): Promise<void> {
    if (!this.ready || this.loading) return;
    if (this.layoutMode === "matchmaking" && !this.podiumWinnerJump) return;
    if (this.seeking && !this.podiumWinnerJump) return;
    const token = this.demoToken + 1;
    this.demoToken = token;
    this.resetBody(this.localPlayer);
    this.localPlayer.facing = this.podiumMode
      ? (this.localSlot % 2 === 0 ? 1 : -1)
      : 1;
    await this.playJump(token, onApex);
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
    const matchmaking = this.layoutMode === "matchmaking";
    const lanes = this.laneXs();
    if (matchmaking) this.layoutExtraPlatforms(lanes, feetY);
    else this.hideExtraPlatforms();

    const podiumTop = this.highestPodiumTop(lobby.top, feetY);
    const available = Math.max(64, (this.podiumMode ? podiumTop : feetY) - stageTop - 8);
    this.scale = PREVIEW_SCALE * (available / FIGHTER_VISUAL_HEIGHT) * (matchmaking ? (this.maxSlots > 2 ? 0.78 : 0.9) : 1);

    if (matchmaking) {
      for (let slot = 0; slot < this.maxSlots; slot += 1) {
        const player = this.slotPlayers[slot];
        if (!player) continue;
        const standY = this.podiumFeetY(slot, lobby.top, feetY);
        player.position.x = lanes[slot] ?? lanes[0];
        player.position.y = standY;
        player.facing = slot % 2 === 0 ? 1 : -1;
      }
      return;
    }
    this.localPlayer.position.x = lanes[0];
    this.localPlayer.position.y = feetY - lobby.top;
  }

  private layoutExtraPlatforms(lanes: number[], feetY: number): void {
    if (!this.extraPlatformRoot) return;
    const lobby = this.lobby.getBoundingClientRect();
    const column = this.extraPlatformRoot.parentElement?.getBoundingClientRect() ?? lobby;
    this.extraPlatformRoot.hidden = false;
    const card = this.playerCard?.getBoundingClientRect();
    if (this.podiumMode && card) {
      this.extraPlatformRoot.style.top = "auto";
      this.extraPlatformRoot.style.bottom = `${Math.max(0, Math.round(column.bottom - card.top))}px`;
      this.extraPlatformRoot.style.height = "140px";
    } else {
      this.extraPlatformRoot.style.top = `${Math.round(feetY - column.top)}px`;
      this.extraPlatformRoot.style.bottom = "";
      this.extraPlatformRoot.style.height = "";
    }
    for (const platform of this.extraPlatforms) {
      const slot = Number(platform.dataset.slot);
      const visible = slot >= 0 && slot < this.maxSlots;
      platform.hidden = !visible;
      if (!visible) continue;
      const lobbyX = lanes[slot] ?? lanes[0];
      platform.style.left = `${Math.round(lobbyX - (column.left - lobby.left))}px`;
      if (this.podiumMode) {
        platform.style.top = "auto";
        platform.style.bottom = "0px";
      } else {
        platform.style.top = "0px";
        platform.style.bottom = "";
        platform.removeAttribute("data-place");
        platform.removeAttribute("data-status");
      }
    }
  }

  private podiumFeetY(slot: number, lobbyTop: number, fallbackFeetY: number): number {
    if (!this.podiumMode) return fallbackFeetY - lobbyTop;
    const oval = this.extraPlatforms[slot]?.querySelector(".character-platform");
    if (!(oval instanceof HTMLElement)) return fallbackFeetY - lobbyTop;
    const rect = oval.getBoundingClientRect();
    if (rect.height < 2) return fallbackFeetY - lobbyTop;
    return rect.top - lobbyTop;
  }

  private highestPodiumTop(lobbyTop: number, fallbackFeetY: number): number {
    if (!this.podiumMode) return fallbackFeetY;
    let top = fallbackFeetY;
    for (let slot = 0; slot < this.maxSlots; slot += 1) {
      top = Math.min(top, this.podiumFeetY(slot, lobbyTop, fallbackFeetY) + lobbyTop);
    }
    return top;
  }

  private hideExtraPlatforms(): void {
    if (!this.extraPlatformRoot) return;
    this.extraPlatformRoot.hidden = true;
    this.extraPlatformRoot.style.top = "";
    this.extraPlatformRoot.style.bottom = "";
    this.extraPlatformRoot.style.height = "";
  }

  private laneXs(): number[] {
    const lobby = this.lobby.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const stageLeft = stage.left - lobby.left;
    const stageWidth = stage.width;
    const fractions = laneFractions(this.layoutMode === "solo" ? 1 : this.maxSlots);
    return fractions.map((fraction) => stageLeft + stageWidth * fraction);
  }

  private feetY(): number {
    const lobby = this.lobby.getBoundingClientRect();
    const platform = this.platform.getBoundingClientRect();
    return Math.min(platform.top, lobby.bottom - 8) - lobby.top;
  }

  private applyLocal(local: PlayerState, spawnIndex: number): void {
    this.localPlayer.id = local.id;
    this.localPlayer.name = local.name;
    this.localPlayer.avatar = { ...local.avatar };
    this.localPlayer.spawnIndex = spawnIndex;
    this.localSlot = spawnIndex;
    this.slotPlayers[spawnIndex] = this.localPlayer;
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

  private async playJump(token: number, onApex?: () => void): Promise<void> {
    audio.play("jump");
    const baseY = this.localPlayer.position.y;
    this.localPlayer.grounded = false;
    this.localPlayer.velocity.y = -20;
    this.localPlayer.position.y = baseY - 36;
    await wait(280);
    if (token !== this.demoToken) return;
    this.localPlayer.velocity.y = 50;
    this.localPlayer.position.y = baseY - 12;
    const apexWork = Promise.resolve(onApex?.());
    await wait(180);
    await apexWork;
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
    facing: spawnIndex % 2 === 0 ? 1 : -1,
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

function laneFractions(count: number): number[] {
  if (count <= 1) return [0.5];
  if (count === 2) return [0.28, 0.72];
  if (count === 3) return [0.22, 0.5, 0.78];
  return [0.16, 0.38, 0.62, 0.84];
}

function clampSlot(spawnIndex: number, maxPlayers: number): number {
  return Math.max(0, Math.min(maxPlayers - 1, spawnIndex));
}

function slotVisible(fighter: FighterSprite, local: FighterSprite): boolean {
  return fighter === local;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
