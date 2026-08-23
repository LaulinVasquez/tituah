import {
  clonePlayerState,
  DEFAULT_STAGE,
  TICK_DT,
  type PlayerState,
} from "@tituah/shared";
import { InputManager } from "../input/input-manager.js";
import { GameSocket } from "../network/game-socket.js";
import { MessageHandler } from "../network/message-handler.js";
import { InterpolationManager } from "../prediction/interpolation-manager.js";
import { PredictionManager } from "../prediction/prediction-manager.js";
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
      this.socket.send({ type: "join", name: this.ui.name(), stageId: this.ui.stageId() });
    });
    this.socket.onClose(() => {
      if (this.state.snapshot?.status === "playing") {
        this.ui.showMenu();
      }
    });
    this.ui.onJoin(() => this.connect());
    this.ui.onAgain(() => this.connect());
    await this.renderer.init(canvas);
    this.ui.showMenu();
    this.loop();
  }

  connect(): void {
    this.ui.rememberName();
    this.ui.showWaiting();
    this.state.snapshot = null;
    this.state.predicted = null;
    this.state.winnerId = null;
    this.socket.connect();
  }

  private onServerMessage(message: import("@tituah/shared").ServerMessage): void {
    const type = message.type;
    if (message.type === "player_hit") {
      this.renderer.showHit(message, this.localTime);
    }
    if (message.type === "player_respawn") {
      this.renderer.showVoidDeath(message.playerId, this.localTime);
    }
    if (type === "welcome") {
      this.ui.showWaiting();
    }
    if (type === "match_started") {
      void this.renderer.setStage(message.snapshot.stageId);
      this.localTime = this.state.snapshot?.time ?? 0;
      this.accumulator = 0;
      if (this.state.localPlayerId && this.state.snapshot) {
        this.prediction.reset(this.state.snapshot, this.state.localPlayerId);
      }
      this.ui.showGame();
    }
    if (type === "snapshot" && this.state.predicted) {
      const reconciled = this.prediction.current();
      if (reconciled) this.state.predicted = reconciled;
    }
    if (type === "match_ended") {
      for (const player of this.state.snapshot?.players ?? []) {
        if (player.id !== this.state.winnerId) {
          this.renderer.showVoidDeath(player.id, this.localTime);
        }
      }
      const winner = this.state.winnerId
        ? this.state.names.get(this.state.winnerId) ?? "Someone"
        : "Nobody";
      this.ui.showResult(`${winner} wins`);
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
