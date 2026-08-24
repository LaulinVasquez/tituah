import {
  clonePlayerState,
  DEFAULT_STAGE,
  SLOT_TO_AVATAR_FIELD,
  TICK_DT,
  type InventoryItem,
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
  private lockerItems: InventoryItem[] = [];

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
      await authService.ensureProfile(authService.profile?.displayName ?? this.ui.displayName());
      this.ui.setLoading(false);
      this.seekingMatch = true;
      this.ui.showWaiting();
      this.state.snapshot = null;
      this.state.predicted = null;
      this.state.winnerId = null;
      // #region agent log
      fetch('http://127.0.0.1:7567/ingest/70db4f25-7ec1-4ecb-b370-9dba08d47b0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'95172e'},body:JSON.stringify({sessionId:'95172e',hypothesisId:'E',location:'game-client.ts:connect',message:'connect / play again',data:{socketConnected:this.socket.connected,leftoverFighters:this.renderer.debugFighters()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (this.socket.connected) {
        void this.sendJoin();
        return;
      }
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
        stageId: this.ui.stageId(),
      });
    } catch (error) {
      this.seekingMatch = false;
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
    const name = this.ui.displayName("edit");
    this.ui.rememberName(name);
    // Optimistic local name so Let's fight shows the update instantly.
    if (authService.profile && name) {
      authService.patchProfile({ displayName: name });
    }
    // Always jump straight to Let's fight — don't wait on network.
    this.ui.showMenu(authService.profile, undefined, this.guestSession());
    try {
      await authService.ensureProfile(name);
      void this.refreshPreview();
    } catch (error) {
      this.ui.showMenu(authService.profile, messageOf(error), this.guestSession());
    }
  }

  private async openLocker(error?: string): Promise<void> {
    const profile = authService.profile ?? (await authService.refreshProfile().catch(() => null));
    if (!profile) {
      this.ui.showLocker(null, [], [], () => undefined, () => undefined, error);
      return;
    }
    // Show the editor immediately with whatever we already have, then refresh inventory.
    this.ui.showLocker(
      profile,
      this.lockerItems,
      [],
      (itemId) => void this.equip(itemId),
      (slot) => void this.unequip(slot),
      error,
    );
    try {
      const [items, inventory] = await Promise.all([
        itemsRepository.listEnabled(),
        inventoryRepository.list(profile.uid),
      ]);
      this.lockerItems = items;
      if (!this.ui.editing) return;
      this.ui.showLocker(
        authService.profile ?? profile,
        items,
        inventory,
        (itemId) => void this.equip(itemId),
        (slot) => void this.unequip(slot),
        error,
      );
    } catch (fetchError) {
      if (this.ui.editing) this.ui.setLockerError(messageOf(fetchError));
    }
  }

  private async equip(itemId: string): Promise<void> {
    const item = this.lockerItems.find((entry) => entry.id === itemId);
    const previous = authService.profile?.avatar;
    if (item && authService.profile) {
      const field = SLOT_TO_AVATAR_FIELD[item.slot];
      this.applyAvatar({ ...authService.profile.avatar, [field]: itemId });
    }
    try {
      this.applyAvatar(await inventoryRepository.equip(itemId));
    } catch (error) {
      if (previous) this.applyAvatar(previous);
      this.ui.setLockerError(messageOf(error));
    }
  }

  private async unequip(slot: ItemSlot): Promise<void> {
    const previous = authService.profile?.avatar;
    if (authService.profile) {
      const field = SLOT_TO_AVATAR_FIELD[slot];
      this.applyAvatar({ ...authService.profile.avatar, [field]: null });
    }
    try {
      this.applyAvatar(await inventoryRepository.unequip(slot));
    } catch (error) {
      if (previous) this.applyAvatar(previous);
      this.ui.setLockerError(messageOf(error));
    }
  }

  private applyAvatar(avatar: NonNullable<typeof authService.profile>["avatar"]): void {
    authService.patchAvatar(avatar);
    this.ui.applyAvatar(avatar);
  }

  private onServerMessage(message: ServerMessage): void {
    if (message.type === "error") {
      this.seekingMatch = false;
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
      const slot = (message.player.spawnIndex % 2 === 0 ? 0 : 1) as 0 | 1;
      const others = message.players.filter((player) => player.id !== message.playerId);
      if (others.length > 0) {
        void this.ui.showVersus(message.player, others[0], "p2-run");
      } else {
        this.ui.showWaiting(slot);
      }
    }
    if (message.type === "player_joined") {
      if (!this.seekingMatch) return;
      const local = this.state.predicted;
      if (!local) return;
      void this.ui.showVersus(local, message.player, "p1-reveal");
    }
    if (message.type === "player_left") {
      if (!this.seekingMatch) return;
      const local = this.state.predicted;
      if (!local) return;
      this.ui.showWaiting((local.spawnIndex % 2 === 0 ? 0 : 1) as 0 | 1);
    }
    if (message.type === "match_countdown") {
      if (!this.seekingMatch) return;
      this.ui.showCountdown(message.seconds);
      sfx.countdown(message.seconds);
    }
    if (message.type === "match_started") {
      this.seekingMatch = false;
      sfx.reset();
      sfx.fight();
      this.renderer.setStage(message.snapshot.stageId);
      this.localTime = this.state.snapshot?.time ?? 0;
      this.accumulator = 0;
      const leftoverFighters = this.renderer.debugFighters();
      this.renderer.resetForMatch();
      // #region agent log
      fetch('http://127.0.0.1:7567/ingest/70db4f25-7ec1-4ecb-b370-9dba08d47b0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'95172e'},body:JSON.stringify({sessionId:'95172e',hypothesisId:'A',location:'game-client.ts:match_started',message:'match started',data:{localTime:this.localTime,snapshotTime:this.state.snapshot?.time ?? null,playerIds:(this.state.snapshot?.players ?? []).map((p)=>p.id),status:this.state.snapshot?.status ?? null,leftoverFighters,resetFighters:this.renderer.debugFighters()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7567/ingest/70db4f25-7ec1-4ecb-b370-9dba08d47b0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'95172e'},body:JSON.stringify({sessionId:'95172e',hypothesisId:'A',location:'game-client.ts:match_ended',message:'match ended',data:{localTime:this.localTime,snapshotTime:this.state.snapshot?.time ?? null,winnerId:this.state.winnerId,playerIds:(this.state.snapshot?.players ?? []).map((p)=>p.id)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      for (const player of this.state.snapshot?.players ?? []) {
        if (player.id !== this.state.winnerId) {
          this.renderer.showVoidDeath(player.id, this.localTime);
        }
      }
      sfx.ko();
      audio.stop("run");
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
