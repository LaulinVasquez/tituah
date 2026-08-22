import {
  clonePlayerState,
  DEFAULT_STAGE,
  TICK_DT,
  type ItemSlot,
  type PlayerState,
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
      void this.sendJoin();
    });
    this.socket.onClose(() => {
      if (this.state.snapshot?.status === "playing") {
        this.ui.showMenu(authService.profile);
      }
    });

    this.ui.onSignIn(() => void this.authenticate("in"));
    this.ui.onSignUp(() => void this.authenticate("up"));
    this.ui.onGuest(() => void this.authenticate("guest"));
    this.ui.onSignOut(() => void this.signOut());
    this.ui.onJoin(() => void this.connect());
    this.ui.onAgain(() => void this.connect());
    this.ui.onOpenLocker(() => void this.openLocker());
    this.ui.onCloseLocker(() => this.ui.showMenu(authService.profile));

    authService.start();
    authService.subscribe(() => {
      if (this.state.playing()) return;
      if (authService.user && authService.profile) {
        this.ui.showMenu(authService.profile);
      } else if (!authService.user) {
        this.ui.showAuth();
      }
    });

    await this.renderer.init(canvas);
    this.ui.showAuth();
    this.loop();
  }

  async connect(): Promise<void> {
    try {
      if (!authService.user) {
        this.ui.showAuth("Sign in first.");
        return;
      }
      this.ui.rememberName();
      await authService.ensureProfile(this.ui.displayName());
      this.ui.showWaiting();
      this.state.snapshot = null;
      this.state.predicted = null;
      this.state.winnerId = null;
      this.socket.connect();
    } catch (error) {
      this.ui.showMenu(authService.profile, messageOf(error));
    }
  }

  private async sendJoin(): Promise<void> {
    try {
      const idToken = await authService.idToken();
      this.socket.send({
        type: "join",
        name: authService.profile?.displayName ?? this.ui.displayName(),
        idToken,
      });
    } catch (error) {
      this.ui.showAuth(messageOf(error));
    }
  }

  private async authenticate(mode: "in" | "up" | "guest"): Promise<void> {
    try {
      const name = this.ui.displayName();
      if (mode === "guest") {
        await authService.playAsGuest(name);
      } else if (mode === "up") {
        await authService.signUp(this.ui.email(), this.ui.password(), name);
      } else {
        await authService.signIn(this.ui.email(), this.ui.password());
      }
      this.ui.rememberName();
      this.ui.showMenu(authService.profile);
    } catch (error) {
      this.ui.showAuth(messageOf(error));
    }
  }

  private async signOut(): Promise<void> {
    this.socket.disconnect();
    await authService.signOut();
    this.ui.showAuth();
  }

  private async openLocker(): Promise<void> {
    const profile = authService.profile ?? (await authService.refreshProfile());
    if (!profile) {
      this.ui.showAuth("Sign in to open the locker.");
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

  private onServerMessage(message: { type: string; message?: string }): void {
    if (message.type === "error") {
      this.socket.disconnect();
      this.ui.showMenu(authService.profile, message.message ?? "Could not join match.");
      return;
    }
    if (message.type === "welcome") {
      this.ui.showWaiting();
    }
    if (message.type === "match_started") {
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
