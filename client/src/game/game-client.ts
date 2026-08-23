import {
  clonePlayerState,
  DEFAULT_STAGE,
  TICK_DT,
  type ItemSlot,
  type PlayerState,
  type ServerMessage,
} from "@tituah/shared";
import { authService } from "../auth/auth-service.js";
import { InputManager } from "../input/input-manager.js";
import { GameSocket } from "../network/game-socket.js";
import { MessageHandler } from "../network/message-handler.js";
import { InterpolationManager } from "../prediction/interpolation-manager.js";
import { PredictionManager } from "../prediction/prediction-manager.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { itemsRepository } from "../repositories/items.repository.js";
import { GameRenderer } from "../rendering/game-renderer.js";
import { Ui } from "../ui.js";
import { GameState } from "./game-state.js";

export class GameClient {
  readonly state = new GameState();
  readonly socket = new GameSocket();
  readonly prediction = new PredictionManager(DEFAULT_STAGE);
  readonly interpolation = new InterpolationManager();
  readonly renderer = new GameRenderer();
  readonly ui = new Ui();

  private input!: InputManager;
  private messages!: MessageHandler;
  private accumulator = 0;
  private lastFrame = performance.now();
  private localTime = 0;
  private seekingMatch = false;

  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.input = new InputManager(canvas);
    this.messages = new MessageHandler(
      this.state,
      this.prediction,
      this.interpolation,
      (message) => this.onServerMessage(message),
    );
    this.socket.onMessage((message) => this.messages.handle(message));
    this.socket.onOpen(() => {
      if (!this.seekingMatch) return;
      void this.sendJoin();
    });
    this.socket.onClose(() => {
      if (this.state.snapshot?.status === "playing") {
        this.ui.showMenu(authService.profile);
        return;
      }
      if (this.seekingMatch && this.ui.currentPane === "waiting") {
        this.seekingMatch = false;
        this.ui.showMenu(authService.profile, "Connection closed.");
      }
    });

    this.ui.onChooseGuest(() => void this.authenticate("guest", this.ui.chooseGuestButton));
    this.ui.onChooseLogin(() => this.ui.showLogin());
    this.ui.onBackToLanding(() => this.ui.showAuth());
    this.ui.onSignIn(() => void this.authenticate("in", this.ui.signInButton));
    this.ui.onSignUp(() => void this.authenticate("up", this.ui.signUpButton));
    this.ui.onSignOut(() => void this.signOut());
    this.ui.onJoin(() => void this.connect());
    this.ui.onCancelWait(() => this.cancelWait());
    this.ui.onAgain(() => void this.connect());
    this.ui.onEditAvatar(() => void this.openLocker());
    this.ui.onSaveAvatar(() => void this.saveFighter());
    this.ui.onBackFromEdit(() => this.ui.closeEditor());

    authService.start();
    authService.subscribe(() => {
      if (this.state.playing()) return;
      if (!authService.user) {
        this.ui.showAuth();
        this.ui.setPreview(null, []);
        return;
      }
      if (!authService.profile) return;
      void this.refreshPreview();
      if (this.ui.isLoading) return;
      const pane = this.ui.currentPane;
      if (pane === "waiting" || pane === "result" || this.ui.editing) return;
      if (pane === "login") return;
      if (pane === "landing" || pane === "menu") {
        this.ui.showMenu(authService.profile, undefined, this.guestSession());
      }
    });

    await this.renderer.init(canvas);
    await this.ui.startFighterPreview();
    if (!authService.user) this.ui.showAuth();
    this.loop();
  }

  async connect(): Promise<void> {
    try {
      if (!authService.user) {
        this.ui.showAuth("Sign in first.");
        return;
      }
      this.ui.rememberName();
      this.ui.setLoading(true);
      await authService.ensureProfile(authService.profile?.displayName ?? this.ui.displayName());
      this.ui.setLoading(false);
      this.seekingMatch = true;
      this.ui.showWaiting();
      this.state.snapshot = null;
      this.state.predicted = null;
      this.state.winnerId = null;
      this.socket.connect();
    } catch (error) {
      this.seekingMatch = false;
      this.ui.setLoading(false);
      this.ui.showMenu(authService.profile, messageOf(error));
    }
  }

  private cancelWait(): void {
    if (!this.seekingMatch) return;
    this.seekingMatch = false;
    this.socket.disconnect();
    this.ui.showMenu(authService.profile);
  }

  private async sendJoin(): Promise<void> {
    try {
      if (!this.seekingMatch) return;
      const idToken = await authService.idToken();
      if (!this.seekingMatch) return;
      this.socket.send({
        type: "join",
        name: authService.profile?.displayName ?? this.ui.displayName(),
        idToken,
      });
    } catch (error) {
      this.seekingMatch = false;
      if (authService.profile) this.ui.showMenu(authService.profile, messageOf(error));
      else this.ui.showAuth(messageOf(error));
    }
  }

  private async authenticate(mode: "in" | "up" | "guest", impact?: HTMLElement): Promise<void> {
    this.ui.setLoading(true);
    try {
      if (mode === "guest") {
        await authService.playAsGuest();
      } else if (mode === "up") {
        await authService.signUp(this.ui.email(), this.ui.password(), this.ui.displayName("login"));
      } else {
        await authService.signIn(this.ui.email(), this.ui.password());
      }
      this.ui.rememberName();
      if (impact) await this.ui.shatterFrom(impact);
    } catch (error) {
      this.ui.setLoading(false);
      this.ui.showAuth(messageOf(error));
      return;
    }
    this.ui.setLoading(false);
    this.ui.showMenu(authService.profile, undefined, this.guestSession());
    await this.refreshPreview();
  }

  private async signOut(): Promise<void> {
    this.seekingMatch = false;
    this.socket.disconnect();
    await authService.signOut();
    this.ui.setPreview(null, []);
    this.ui.showAuth();
  }

  private guestSession(): boolean {
    return authService.user?.isAnonymous === true;
  }

  private async refreshPreview(): Promise<void> {
    const profile = authService.profile;
    if (!profile) {
      this.ui.setPreview(null, []);
      return;
    }
    try {
      const items = await itemsRepository.listEnabled();
      this.ui.setPreview(profile, items, this.guestSession());
    } catch {
      this.ui.setPreview(profile, [], this.guestSession());
    }
  }

  private async saveFighter(): Promise<void> {
    try {
      await authService.ensureProfile(this.ui.displayName("edit"));
      this.ui.rememberName();
      await this.refreshPreview();
      this.ui.closeEditor();
    } catch (error) {
      await this.openLocker(messageOf(error));
    }
  }

  private async openLocker(error?: string): Promise<void> {
    const profile = authService.profile ?? (await authService.refreshProfile().catch(() => null));
    if (!profile) {
      this.ui.showLocker(null, [], [], () => undefined, () => undefined, error);
      return;
    }
    const [items, inventory] = await Promise.all([
      itemsRepository.listEnabled(),
      inventoryRepository.list(profile.uid),
    ]);
    this.ui.showLocker(
      profile,
      items,
      inventory,
      (itemId) => void this.equip(itemId),
      (slot) => void this.unequip(slot),
      error,
    );
  }

  private async equip(itemId: string): Promise<void> {
    await inventoryRepository.equip(itemId);
    await authService.refreshProfile();
    await this.openLocker();
  }

  private async unequip(slot: ItemSlot): Promise<void> {
    await inventoryRepository.unequip(slot);
    await authService.refreshProfile();
    await this.openLocker();
  }

  private onServerMessage(message: ServerMessage): void {
    if (message.type === "error") {
      this.seekingMatch = false;
      this.socket.disconnect();
      this.ui.showMenu(authService.profile, message.message ?? "Could not join match.");
      return;
    }
    if (message.type === "player_hit") {
      this.renderer.showHit(message.targetId, this.localTime);
    }
    if (message.type === "player_respawn") {
      this.renderer.showKo(message.playerId, this.localTime);
    }
    if (message.type === "welcome") {
      if (!this.seekingMatch) return;
      this.ui.showWaiting();
    }
    if (message.type === "match_started") {
      this.seekingMatch = false;
      this.localTime = this.state.snapshot?.time ?? 0;
      this.accumulator = 0;
      if (this.state.localPlayerId && this.state.snapshot) {
        this.prediction.reset(this.state.snapshot, this.state.localPlayerId);
      }
      this.ui.showGame();
    }
    if (message.type === "snapshot" && this.state.predicted) {
      const reconciled = this.prediction.current();
      if (reconciled) this.state.predicted = reconciled;
    }
    if (message.type === "match_ended") {
      for (const player of this.state.snapshot?.players ?? []) {
        if (player.id !== this.state.winnerId) this.renderer.showKo(player.id, this.localTime);
      }
      const winner = this.state.winnerId
        ? this.state.names.get(this.state.winnerId) ?? "Someone"
        : "Nobody";
      this.ui.showResult(`${winner} wins`);
      void authService.refreshProfile();
    }
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.accumulator += dt;

    while (this.accumulator >= TICK_DT) {
      this.step();
      this.accumulator -= TICK_DT;
    }

    this.draw();
    requestAnimationFrame(this.loop);
  };

  private step(): void {
    if (!this.state.playing() || !this.state.localPlayerId) return;

    const { input, attackEdge } = this.input.sample();
    this.socket.send({ type: "input", input });
    if (attackEdge === "start") this.socket.send({ type: "attack_start" });
    if (attackEdge === "release") this.socket.send({ type: "attack_release" });

    this.localTime += TICK_DT;
    const base =
      this.state.predicted ??
      this.state.getPlayer(this.state.localPlayerId);
    if (!base) return;
    if (authService.profile) {
      base.avatar = authService.profile.avatar;
    }
    const predicted = this.prediction.apply(clonePlayerState(base), input, this.localTime);
    this.state.predicted = predicted;
  }

  private draw(): void {
    const players: PlayerState[] = [];
    const localId = this.state.localPlayerId;

    if (this.state.predicted && localId) {
      players.push(this.state.predicted);
    }

    for (const player of this.state.snapshot?.players ?? []) {
      if (player.id === localId) continue;
      players.push(this.interpolation.getPlayer(player.id) ?? player);
    }

    const time = this.state.snapshot?.time ?? this.localTime;
    this.renderer.render(players, this.localTime || time);
    this.ui.updateHud(this.state);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
