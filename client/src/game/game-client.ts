import {
  clonePlayerState,
  DEFAULT_STAGE,
  parsePlayerCount,
  TICK_DT,
  type FighterColor,
  type PlayerState,
  type ServerMessage,
} from "@tituah/shared";
import { authService } from "../auth/auth-service.js";
import { InputManager } from "../input/input-manager.js";
import { GameSocket } from "../network/game-socket.js";
import { MessageHandler } from "../network/message-handler.js";
import { InterpolationManager } from "../prediction/interpolation-manager.js";
import { PredictionManager } from "../prediction/prediction-manager.js";
import { GameRenderer } from "../rendering/game-renderer.js";
import { Ui } from "../ui.js";
import { audio } from "../audio/audio-manager.js";
import { sfx } from "../audio/sfx-director.js";
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
  private inRoom = false;
  private colorSave: Promise<void> = Promise.resolve();

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
        this.inRoom = false;
        this.seekingMatch = false;
        this.ui.showMenu(authService.profile);
        return;
      }
      if (this.seekingMatch || this.inRoom) {
        this.seekingMatch = false;
        this.inRoom = false;
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
    this.ui.onCancelWait(() => this.leaveRoom());
    this.ui.onAgain(() => this.readyUp());
    this.ui.onResultBack(() => this.leaveRoom());
    this.ui.onExitMatch(() => this.leaveRoom());
    this.ui.onEditAvatar(() => void this.openEditor());
    this.ui.onSaveAvatar(() => void this.saveFighter());
    this.ui.onSelectColor((color) => this.persistColor(color));
    this.ui.onBackFromEdit(() => this.ui.closeEditor());

    authService.start();
    authService.subscribe(() => {
      if (this.state.playing()) return;
      if (!authService.user) {
        this.ui.showAuth();
        this.ui.setPreview(null);
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
    void audio.load();
    window.addEventListener("pointerdown", () => void audio.unlock());
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
      await this.colorSave.catch(() => undefined);
      await authService.ensureProfile(authService.profile?.displayName ?? this.ui.displayName());
      this.ui.setLoading(false);
      this.seekingMatch = true;
      this.ui.showWaiting();
      this.state.snapshot = null;
      this.state.predicted = null;
      this.state.winnerId = null;
      if (this.socket.connected) {
        void this.sendJoin();
        return;
      }
      this.socket.connect();
    } catch (error) {
      this.seekingMatch = false;
      this.inRoom = false;
      this.ui.setLoading(false);
      this.ui.showMenu(authService.profile, messageOf(error));
    }
  }

  private leaveRoom(): void {
    this.input.reset();
    this.seekingMatch = false;
    this.inRoom = false;
    this.socket.disconnect();
    this.ui.showMenu(authService.profile);
  }

  private readyUp(): void {
    if (!this.inRoom || !this.socket.connected) return;
    this.ui.markLocalReady();
    this.socket.send({ type: "ready" });
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
        stageId: this.ui.stageId(),
        playerCount: this.ui.playerCount(),
      });
    } catch (error) {
      this.seekingMatch = false;
      this.inRoom = false;
      if (authService.profile) this.ui.showMenu(authService.profile, messageOf(error));
      else this.ui.showAuth(messageOf(error));
    }
  }

  private async authenticate(mode: "in" | "up" | "guest", impact?: HTMLElement): Promise<void> {
    if (this.ui.isLoading) return;
    try {
      if (impact) await this.ui.slapToward(impact);
      this.ui.setLoading(true);
      if (mode === "guest") {
        await authService.playAsGuest();
      } else if (mode === "up") {
        await authService.signUp(this.ui.email(), this.ui.password(), this.ui.displayName("login"));
      } else {
        await authService.signIn(this.ui.email(), this.ui.password());
      }
      this.ui.rememberName();
      this.ui.showMenu(authService.profile, undefined, this.guestSession());
      void this.refreshPreview();
    } catch (error) {
      this.ui.showAuth(messageOf(error));
    } finally {
      this.ui.setLoading(false);
    }
  }

  private async signOut(): Promise<void> {
    this.seekingMatch = false;
    this.inRoom = false;
    this.socket.disconnect();
    await authService.signOut();
    this.ui.setPreview(null);
    this.ui.showAuth();
  }

  private guestSession(): boolean {
    return authService.user?.isAnonymous === true;
  }

  private async refreshPreview(): Promise<void> {
    const profile = authService.profile;
    if (!profile) {
      this.ui.setPreview(null);
      return;
    }
    this.ui.setPreview(profile, this.guestSession());
  }

  private async saveFighter(): Promise<void> {
    const name = this.ui.displayName("edit");
    const color = this.ui.fighterColor();
    this.ui.rememberName(name);
    if (authService.profile) {
      authService.patchProfile({ displayName: name });
      authService.patchAvatar({ ...authService.profile.avatar, baseAvatarId: color });
    }
    this.ui.showMenu(authService.profile, undefined, this.guestSession());
    try {
      await this.colorSave.catch(() => undefined);
      await authService.saveFighter({ displayName: name, baseAvatarId: color });
      void this.refreshPreview();
    } catch (error) {
      this.ui.showMenu(authService.profile, messageOf(error), this.guestSession());
    }
  }

  private persistColor(color: FighterColor): void {
    if (!authService.profile) return;
    this.colorSave = this.colorSave
      .catch(() => undefined)
      .then(async () => {
        await authService.persistAvatarColor(color);
      });
  }

  private async openEditor(error?: string): Promise<void> {
    const profile = authService.profile ?? (await authService.refreshProfile().catch(() => null));
    this.ui.showEditor(profile, error);
  }

  private onServerMessage(message: ServerMessage): void {
    if (message.type === "error") {
      this.seekingMatch = false;
      this.inRoom = false;
      this.socket.disconnect();
      this.ui.showMenu(authService.profile, message.message ?? "Could not join match.");
      return;
    }
    if (message.type === "player_hit") {
      this.renderer.showHit(message, this.localTime);
      sfx.hit(message.charge);
    }
    if (message.type === "player_respawn") {
      this.renderer.showVoidDeath(message.playerId, this.localTime);
      sfx.respawn();
    }
    if (message.type === "welcome") {
      if (!this.seekingMatch) return;
      this.inRoom = true;
      const maxPlayers = parsePlayerCount(message.maxPlayers);
      if (message.rematch) {
        this.ui.showResult(
          message.winnerId,
          message.player,
          message.players,
          maxPlayers,
          message.readyIds,
          message.placements ?? {},
        );
        return;
      }
      const others = message.players.filter((player) => player.id !== message.playerId);
      if (others.length > 0) {
        void this.ui.showRoster(message.player, message.players, maxPlayers, "join-run");
      } else {
        this.ui.showWaiting(message.player.spawnIndex, maxPlayers);
      }
    }
    if (message.type === "player_joined") {
      if (this.state.playing()) return;
      if (!this.inRoom && !this.seekingMatch) return;
      this.ui.addWaitingPlayer(message.player, message.readyIds);
    }
    if (message.type === "player_left") {
      if (this.state.playing()) return;
      if (!this.inRoom && !this.seekingMatch) return;
      this.ui.removeWaitingPlayer(message.playerId);
    }
    if (message.type === "player_ready") {
      if (this.state.playing()) return;
      if (!this.inRoom && !this.seekingMatch) return;
      this.ui.setReadyIds(message.readyIds);
    }
    if (message.type === "match_countdown") {
      if (this.state.playing()) return;
      if (!this.inRoom && !this.seekingMatch) return;
      this.ui.showCountdown(message.seconds);
      sfx.countdown(message.seconds);
    }
    if (message.type === "match_started") {
      this.input.reset();
      this.seekingMatch = false;
      this.inRoom = true;
      sfx.reset();
      sfx.fight();
      this.renderer.setStage(message.snapshot.stageId);
      this.localTime = this.state.snapshot?.time ?? 0;
      this.accumulator = 0;
      this.renderer.resetForMatch();
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
      this.input.reset();
      sfx.ko();
      audio.stop("run");
      this.inRoom = true;
      this.seekingMatch = true;
      const players = message.players.length > 0 ? message.players : this.state.snapshot?.players ?? [];
      for (const player of players) {
        this.state.addRemoteName(player.id, player.name);
      }
      const localId = this.state.localPlayerId;
      const local = players.find((player) => player.id === localId) ?? null;
      this.ui.showResult(
        this.state.winnerId,
        local,
        players,
        parsePlayerCount(message.maxPlayers || this.state.snapshot?.maxPlayers),
        [],
        message.placements ?? {},
      );
      void authService.refreshProfile();
    }
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!document.hidden && this.state.playing()) {
      this.accumulator += dt;
      while (this.accumulator >= TICK_DT) {
        this.step();
        this.accumulator -= TICK_DT;
      }
      this.draw();
    } else {
      this.accumulator = 0;
    }

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
    sfx.observe(predicted);
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
