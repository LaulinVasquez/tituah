import {
  FIGHTER_COLOR_HEX,
  FIGHTER_COLORS,
  FIGHTER_VARIANT_CUPS,
  THROWABLE_IDS,
  THROWABLE_LABELS,
  accessoryUnlockLevel,
  colorUnlockLevel,
  emptyAvatar,
  fighterColorFromId,
  isAccessoryUnlocked,
  isColorUnlocked,
  isFighterColor,
  isStageId,
  isStagePreference,
  isThrowableId,
  isThrowableUnlocked,
  parsePlayerCount,
  throwableIdFromAvatar,
  throwableUnlockLevel,
  type FighterColor,
  type PlayerCount,
  type PlayerCountPreference,
  type StageId,
  type StagePreference,
  type PlayerState,
  type ThrowableId,
  type UserProfile,
} from "@tituah/shared";
import {
  BAKED_ACCESSORIES,
  BAKED_ACCESSORY_FIELDS,
  bakedAccessoryIdFromAvatar,
  isBakedAccessoryId,
} from "./rendering/sprites/accessory-sheets.js";
import type { GameState } from "./game/game-state.js";
import {
  LobbyFighterPreview,
  type LobbyDemoMove,
  type PodiumStand,
} from "./rendering/lobby-fighter-preview.js";
import { STAGE_VISUALS } from "./rendering/stages/stage-config.js";
import { audio } from "./audio/audio-manager.js";
import { shatterElement } from "./shatter-pane.js";
import { prefersNativeTapHandling } from "./config/runtime.js";
import { createElement, Gamepad2, Lock, X } from "lucide";

type LobbyPane = "landing" | "login" | "menu" | "waiting" | "result" | "edit";

const DEMO_MOVES = new Set<LobbyDemoMove>([
  "idle",
  "run",
  "jump",
  "slap",
  "runSlap",
  "hit",
  "throw",
]);

const JOYSTICK_STORAGE_KEY = "tituah:joystick";

function readJoystickVisible(): boolean {
  const stored = localStorage.getItem(JOYSTICK_STORAGE_KEY);
  if (stored === null) {
    // Touch: start with the instruction box; desktop keeps pads off by default here.
    return false;
  }
  return stored !== "0";
}

function writeJoystickVisible(visible: boolean): void {
  localStorage.setItem(JOYSTICK_STORAGE_KEY, visible ? "1" : "0");
}

export class Ui {
  readonly overlay = required("#overlay");
  readonly hud = required("#hud");
  readonly lobby = required("#lobby");
  readonly lobbyOptions = required("#lobby-options");
  readonly characterColumn = required("#character-column");
  readonly characterStage = required("#character-stage");
  readonly characterStageBackdrop = required("#character-stage-backdrop");
  readonly playerCard = required("#player-card");
  readonly previewName = required("#preview-name");
  readonly playerStats = required("#player-stats");
  readonly accountStatus = required("#account-status", HTMLButtonElement);
  readonly accountStatusTip = required("#account-status-tip");
  readonly editorHint = required("#editor-hint");
  readonly colorGrid = required("#color-grid");
  readonly throwableGrid = required("#throwable-grid");
  readonly faceAccessoryGrid = required("#face-accessory-grid");
  readonly joystickToggle = required("#joystick-toggle", HTMLButtonElement);
  readonly editButton = required("#edit-avatar", HTMLButtonElement);
  readonly saveAvatarButton = required("#save-avatar", HTMLButtonElement);
  readonly profileActionSlot = required(".profile-action-slot");
  readonly backEditButton = required("#back-edit", HTMLButtonElement);
  readonly displayNameInput = required("#display-name", HTMLInputElement);
  readonly loginNameInput = required("#login-name", HTMLInputElement);
  readonly emailInput = required("#email", HTMLInputElement);
  readonly passwordInput = required("#password", HTMLInputElement);
  readonly chooseGuestButton = required("#choose-guest", HTMLButtonElement);
  readonly chooseLoginButton = required("#choose-login", HTMLButtonElement);
  readonly signInButton = required("#sign-in", HTMLButtonElement);
  readonly signUpButton = required("#sign-up", HTMLButtonElement);
  readonly joinButton = required("#join", HTMLButtonElement);
  readonly againButton = required("#again", HTMLButtonElement);
  readonly cancelWaitButton = required("#cancel-wait", HTMLButtonElement);
  readonly signOutButton = required("#sign-out", HTMLButtonElement);
  readonly landingError = required("#landing-error");
  readonly authError = required("#auth-error");
  readonly menuError = required("#menu-error");
  readonly editError = required("#edit-error");
  readonly resultTitle = required("#result-title");
  readonly muteButton = required("#audio-mute", HTMLButtonElement);
  readonly hudAudioButton = required("#hud-audio", HTMLButtonElement);
  readonly hudExitButton = required("#hud-exit", HTMLButtonElement);
  readonly mixer = required("#audio-mixer");
  readonly exitConfirm = required("#exit-confirm");
  readonly signOutConfirm = required("#sign-out-confirm");
  readonly stageButtons = document.querySelectorAll<HTMLButtonElement>("[data-stage]");
  readonly playerCountModeButtons = document.querySelectorAll<HTMLButtonElement>("[data-players-mode]");
  readonly playerCountCarousel = required("#player-count-carousel");
  readonly playerCountValue = required("#player-count-value");
  readonly playerCountPrev = required("#player-count-prev", HTMLButtonElement);
  readonly playerCountNext = required("#player-count-next", HTMLButtonElement);
  readonly startMatchButton = required("#start-match", HTMLButtonElement);

  private pane: LobbyPane = "landing";
  private paneBeforeEdit: LobbyPane = "landing";
  private slapping = false;
  private loading = false;
  private editPreviewToken = 0;
  private guestSession = false;
  private accountEmail: string | null = null;
  private accountTipOpen = false;
  private selectedColor: FighterColor = "orange";
  private selectedThrowable: ThrowableId = "sandal";
  private selectedAccessoryId: string | null = null;
  private onColorSelected: (color: FighterColor) => void = () => undefined;
  private onThrowableSelected: (throwableId: ThrowableId) => void = () => undefined;
  private onAccessorySelected: (accessoryId: string | null) => void = () => undefined;
  private profile: UserProfile | null = null;
  private fighter?: LobbyFighterPreview;
  private selectedStage: StagePreference = "any";
  private selectedPlayerCount: PlayerCountPreference = "any";
  private setPlayerCount: PlayerCount = 2;
  private matchSize: PlayerCount = 4;
  private openMatch = false;
  private waitingRoster: PlayerState[] = [];
  private waitingLocal: PlayerState | null = null;
  private rematchReadyIds: Set<string> | null = null;
  private resultPlacements: Record<string, number> = {};
  private resultWinnerId: string | null = null;
  private hudKey = "";
  private mixerOpen = false;
  private mixerAnchor: HTMLButtonElement | null = null;
  private exitConfirmOpen = false;
  private signOutConfirmOpen = false;
  /** Ignore Edit/Save until this time — they share a slot and ghost-clicks swap instantly. */
  private profileActionGuardUntil = 0;
  private readonly directTapHandling = prefersNativeTapHandling();
  private readonly hudSlots = [...this.hud.querySelectorAll<HTMLElement>(".fighter")].map((slot) => ({
    index: Number(slot.dataset.slot),
    node: slot,
    name: slot.querySelector(".name"),
    lives: slot.querySelector(".lives"),
    throwCooldown: slot.querySelector<HTMLElement>(".throw-cooldown"),
    percent: slot.querySelector(".percent"),
  }));

  get currentPane(): LobbyPane {
    return this.pane;
  }

  get editing(): boolean {
    return this.pane === "edit";
  }

  get isLoading(): boolean {
    return this.loading;
  }

  get usesDirectTapHandling(): boolean {
    return this.directTapHandling;
  }

  constructor() {
    if (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches) {
      document.documentElement.classList.add("has-touch");
    }
    const stored = localStorage.getItem("tituah:name");
    if (stored) this.loginNameInput.value = stored;
    for (const button of this.stageButtons) {
      button.addEventListener("click", () => {
        const id = button.dataset.stage;
        if (!isStagePreference(id)) return;
        this.selectStage(id);
      });
    }
    for (const button of this.playerCountModeButtons) {
      button.addEventListener("click", () => {
        const mode = button.dataset.playersMode;
        if (mode === "any") {
          this.selectPlayerCount("any");
          return;
        }
        if (mode === "set") this.selectPlayerCount(this.setPlayerCount);
      });
    }
    this.playerCountPrev.addEventListener("click", () => this.nudgeSetPlayerCount(-1));
    this.playerCountNext.addEventListener("click", () => this.nudgeSetPlayerCount(1));
    this.displayNameInput.addEventListener("input", () => {
      if (this.pane === "edit") this.setPreviewName(this.displayNameInput.value.trim() || "Fighter");
    });
    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.signInButton.click();
    });
    this.displayNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.saveAvatarButton.click();
    });
    this.colorGrid.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-color]");
      if (!button || button.disabled || button.dataset.locked === "true" || this.slapping) return;
      const color = button.dataset.color;
      if (!isFighterColor(color)) return;
      void this.selectColor(color, true);
    });
    this.throwableGrid.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-throwable]");
      if (!button || button.disabled || button.dataset.locked === "true" || this.slapping) return;
      const throwableId = button.dataset.throwable;
      if (!isThrowableId(throwableId)) return;
      void this.selectThrowable(throwableId, true);
    });
    this.faceAccessoryGrid.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-face]");
      if (!button || button.disabled || button.dataset.locked === "true" || this.slapping) return;
      const faceId = button.dataset.face;
      if (!faceId || !isBakedAccessoryId(faceId)) return;
      const next = this.selectedAccessoryId === faceId ? null : faceId;
      void this.selectAccessory(next, true);
    });
    this.selectStage(this.selectedStage);
    this.selectPlayerCount(this.selectedPlayerCount);
    this.mountStageThumbs();
    this.bindMixer();
    this.bindJoystickToggle();
    this.bindAccountStatus();
    if (this.directTapHandling) {
      for (const button of this.playerCard.querySelectorAll<HTMLButtonElement>("[data-demo-move]")) {
        button.addEventListener("click", () => {
          const demo = button.dataset.demoMove;
          if (!demo || !isDemoMove(demo)) return;
          this.setActiveMove(demo);
          this.fighter?.playMove(demo);
        });
      }
    } else {
      required("#lobby").addEventListener(
        "click",
        (event) => {
          const button = (event.target as HTMLElement | null)?.closest("button");
          if (!button || button.disabled || this.loading) return;
          if (button.id === "audio-mute" || button.id === "sign-out" || button.id === "back-edit" || button.closest("#audio-mixer, #sign-out-confirm, #exit-confirm")) return;
          if (button.dataset.slapReplay === "true") return;
          // Auth buttons use their own listeners (slap + sign-in in authenticate).
          if (
            button.id === "choose-guest"
            || button.id === "sign-in"
            || button.id === "sign-up"
          ) {
            return;
          }
          // Color / throwable swatches handle their own in-place jump.
          if (button.classList.contains("color-swatch")) return;
          if (button.classList.contains("throwable-swatch")) return;
          if (button.classList.contains("face-swatch")) return;
          if (button.id === "joystick-toggle") return;
          if (button.id === "account-status") return;
          if (button.id === "cancel-wait") return;
          if (button.id === "edit-avatar" || button.id === "save-avatar") return;
          if (button.id === "start-match") return;
          const demo = button.dataset.demoMove;
          if (demo && isDemoMove(demo)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (this.slapping) return;
            this.setActiveMove(demo);
            if (demo === "slap") {
              void this.slapThen(button, () => undefined, false);
              return;
            }
            this.fighter?.playMove(demo);
            return;
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          if (this.slapping) return;
          const replay = (): void => {
            button.dataset.slapReplay = "true";
            button.click();
            delete button.dataset.slapReplay;
          };
          if (button.id === "again" || button.id === "result-back") {
            void this.slapThen(button, replay, false);
            return;
          }
          if (button.dataset.stage || button.dataset.playersMode) {
            void this.jumpThen(replay);
            return;
          }
          if (
            button.id === "player-count-prev"
            || button.id === "player-count-next"
          ) {
            return;
          }
          const shatter = button.dataset.deferShatter !== "true";
          if (button.dataset.skipSlap === "true") {
            void this.shatterThen(button, replay);
            return;
          }
          void this.slapThen(button, replay, shatter);
        },
        true,
      );
    }
  }

  async startFighterPreview(): Promise<void> {
    void audio.load();
    const canvas = required("#lobby-fighter");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing lobby fighter canvas");
    this.fighter = new LobbyFighterPreview(
      canvas,
      this.lobby,
      this.characterStage,
      required("#character-platform"),
    );
    await this.fighter.start();
    this.fighter.setAvatar(this.profile?.avatar ?? null);
    this.updatePlayerCard();
  }

  displayName(source: "edit" | "login" | "any" = "any"): string {
    if (source === "edit") return this.displayNameInput.value.trim() || "Fighter";
    if (source === "login") return this.loginNameInput.value.trim() || "Fighter";
    return this.profile?.displayName || this.loginNameInput.value.trim() || "Fighter";
  }

  stageId(): StagePreference {
    return this.selectedStage;
  }

  playerCount(): PlayerCountPreference {
    return this.selectedPlayerCount;
  }

  applyMatchStage(stageId: string): void {
    if (!isStageId(stageId)) return;
    const url = STAGE_VISUALS[stageId].background;
    this.characterStageBackdrop.style.setProperty("--stage-backdrop", `url("${url}")`);
  }

  private mountStageThumbs(): void {
    const thumbs = {
      barnyard: STAGE_VISUALS.barnyard.background,
      fridge: STAGE_VISUALS.fridge.background,
      meadow: STAGE_VISUALS.meadow.background,
    } as const;
    for (const button of this.stageButtons) {
      const stage = button.dataset.stage;
      if (stage === "any") {
        button.style.setProperty("--stage-thumb-a", `url("${thumbs.barnyard}")`);
        button.style.setProperty("--stage-thumb-b", `url("${thumbs.fridge}")`);
        button.style.setProperty("--stage-thumb-c", `url("${thumbs.meadow}")`);
        button.style.setProperty("--stage-thumb", `url("${thumbs.barnyard}")`);
        continue;
      }
      if (stage === "barnyard" || stage === "fridge" || stage === "meadow") {
        button.style.setProperty("--stage-thumb", `url("${thumbs[stage]}")`);
      }
    }
  }

  private selectStage(stageId: StagePreference): void {
    this.selectedStage = stageId;
    for (const entry of this.stageButtons) {
      entry.dataset.selected = String(entry.dataset.stage === stageId);
    }
    const previewId: StageId = stageId === "any" ? "barnyard" : stageId;
    const url = STAGE_VISUALS[previewId].background;
    this.characterStageBackdrop.style.setProperty("--stage-backdrop", `url("${url}")`);
  }

  private selectPlayerCount(preference: PlayerCountPreference): void {
    this.selectedPlayerCount = preference;
    if (preference !== "any") this.setPlayerCount = preference;
    const setMode = preference !== "any";
    for (const entry of this.playerCountModeButtons) {
      const mode = entry.dataset.playersMode;
      entry.dataset.selected = String(mode === "any" ? !setMode : setMode);
    }
    this.playerCountCarousel.hidden = false;
    this.playerCountCarousel.classList.toggle("is-blocked", !setMode);
    this.playerCountValue.textContent = String(this.setPlayerCount);
    this.playerCountPrev.disabled = !setMode || this.setPlayerCount <= 2;
    this.playerCountNext.disabled = !setMode || this.setPlayerCount >= 4;
  }

  private nudgeSetPlayerCount(delta: -1 | 1): void {
    const next = this.setPlayerCount + delta;
    if (next < 2 || next > 4) return;
    this.selectPlayerCount(parsePlayerCount(next));
  }

  private preferredCapacity(): PlayerCount {
    return this.selectedPlayerCount === "any" ? 4 : this.selectedPlayerCount;
  }

  email(): string {
    return this.emailInput.value.trim();
  }

  password(): string {
    return this.passwordInput.value;
  }

  showAuth(error?: string): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    this.hud.hidden = true;
    if (error && this.pane === "login") {
      this.setPane(this.pane);
      this.setPaneError(error);
      return;
    }
    this.setPane("landing");
    this.setPaneError(error);
  }

  showLogin(error?: string): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPane("login");
    this.setPaneError(error);
    this.emailInput.focus();
  }

  showMenu(
    profile?: UserProfile | null,
    error?: string,
    guestSession = this.guestSession,
    accountEmail = this.accountEmail,
  ): void {
    this.openMatch = false;
    this.startMatchButton.hidden = true;
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPreview(profile ?? this.profile, guestSession, accountEmail);
    this.setPane("menu");
    this.setPaneError(error);
  }

  showEditor(
    profile: UserProfile | null,
    error?: string,
    guestSession = this.guestSession,
    accountEmail = this.accountEmail,
  ): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    if (this.pane !== "edit") this.paneBeforeEdit = this.pane;
    this.selectedColor = fighterColorFromId(profile?.avatar.baseAvatarId);
    this.selectedThrowable = throwableIdFromAvatar(profile?.avatar.throwableId);
    this.selectedAccessoryId = bakedAccessoryIdFromAvatar(profile?.avatar);
    this.setPreview(profile, guestSession, accountEmail);
    this.displayNameInput.value = profile?.displayName ?? "";
    this.setPane("edit");
    this.renderColorPicker(profile);
    this.renderThrowablePicker(profile);
    this.renderFaceAccessoryPicker(profile);
    this.fighter?.setAvatar(this.avatarWithLoadout({}));
    this.setError(this.editError, error);
    this.setActiveMove("idle");
  }

  fighterColor(): FighterColor {
    return this.selectedColor;
  }

  fighterThrowable(): ThrowableId {
    return this.selectedThrowable;
  }

  fighterAccessory(): string | null {
    return this.selectedAccessoryId;
  }

  closeEditor(): void {
    this.fighter?.playMove("idle");
    this.setActiveMove("idle");
    // Prefer Let's fight whenever a fighter is loaded.
    if (this.profile) {
      this.showMenu(this.profile, undefined, this.guestSession, this.accountEmail);
      return;
    }
    // Guest / lobby edit: never dump to the signed-out landing screen.
    if (this.guestSession || this.paneBeforeEdit === "menu") {
      this.showMenu(this.profile, undefined, this.guestSession, this.accountEmail);
      return;
    }
    const previous = this.paneBeforeEdit;
    if (previous === "login") this.showLogin();
    else this.showAuth();
  }

  showWaiting(slot?: number, maxPlayers: PlayerCount = this.preferredCapacity(), openMatch?: boolean): void {
    this.matchSize = maxPlayers;
    if (openMatch !== undefined) this.openMatch = openMatch;
    else this.openMatch = this.selectedPlayerCount === "any";
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setSeeking(true);
    this.setMatchmakingMode(true);
    if (slot === undefined) this.applyWaitingSlotPending();
    else this.applyWaitingSlot(slot);
    required("#waiting-solo").hidden = false;
    required("#waiting-versus").hidden = true;
    required("#waiting-countdown").hidden = true;
    const waitingLabel = this.openMatch
      ? "Waiting for players (up to 4)"
      : maxPlayers === 2
        ? "Waiting for opponent"
        : "Waiting for players";
    required("#waiting-title").textContent = waitingLabel;
    this.syncStartMatchButton();
    this.setPane("waiting");
    if (this.profile) {
      const spawnIndex = slot ?? 0;
      const local: PlayerState = {
        id: this.profile.uid,
        name: this.profile.displayName,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        facing: spawnIndex % 2 === 0 ? 1 : -1,
        grounded: true,
        jumpsRemaining: 2,
        health: 100,
        damagePercent: 0,
        attackState: { type: "idle" },
        throwCooldownEndsAt: 0,
        throwAnimUntil: 0,
        throwChargeStartedAt: 0,
        lives: 1,
        lastInputSeq: 0,
        spawnIndex,
        invulnerableUntil: 0,
        avatar: this.profile.avatar,
      };
      this.waitingLocal = local;
      this.waitingRoster = [local];
      this.syncVersusRoster(this.waitingRoster, maxPlayers);
      this.fighter?.setWaitingRoster(local, maxPlayers);
    } else {
      this.syncVersusRoster([], maxPlayers);
    }
  }

  async showVersus(
    local: PlayerState,
    opponent: PlayerState,
    entrance: "p1-reveal" | "p2-run" | "instant" = "instant",
  ): Promise<void> {
    await this.showRoster(local, [local, opponent], this.matchSize, entrance === "p2-run" ? "join-run" : "reveal");
  }

  async showRoster(
    local: PlayerState,
    players: PlayerState[],
    maxPlayers: PlayerCount = this.matchSize,
    entrance: "join-run" | "reveal" | "instant" = "instant",
    openMatch = this.openMatch,
  ): Promise<void> {
    this.matchSize = maxPlayers;
    this.openMatch = openMatch;
    this.waitingLocal = local;
    this.waitingRoster = [...players];
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setSeeking(this.openMatch || players.length < maxPlayers);
    this.setMatchmakingMode(true);
    this.applyWaitingSlot(local.spawnIndex);
    const full = players.length >= maxPlayers;
    const hasCompany = players.length > 1;
    required("#waiting-solo").hidden = hasCompany;
    required("#waiting-versus").hidden = !hasCompany;
    required("#waiting-countdown").hidden = true;
    required("#countdown-banner").hidden = true;
    const versusBlurb = required("#waiting-versus").querySelector(".blurb");
    if (versusBlurb) {
      versusBlurb.textContent = this.openMatch
        ? players.length >= 2
          ? "Enough players — anyone can press Start."
          : "Waiting for more fighters…"
        : full
          ? "Match found — fighters ready. Countdown starting…"
          : "Waiting for the lobby to fill…";
    }
    if (this.openMatch) {
      required("#waiting-title").textContent = `Waiting for players (${players.length}/${maxPlayers})`;
    } else {
      required("#waiting-title").textContent = full
        ? "Match found"
        : `Waiting for players (${players.length}/${maxPlayers})`;
    }
    this.syncVersusRoster(players, maxPlayers);
    this.syncStartMatchButton();
    this.setPane("waiting");

    const others = players.filter((player) => player.id !== local.id);
    if (entrance === "join-run" && others.length > 0) {
      await this.fighter?.enterAsJoiner(local, others, maxPlayers);
      this.syncVersusRoster(players, maxPlayers);
      return;
    }
    if (entrance === "reveal" && others.length > 0) {
      this.fighter?.setWaitingRoster(local, maxPlayers);
      for (const other of others) this.fighter?.revealPlayer(other);
      return;
    }
    this.fighter?.setWaitingRoster(local, maxPlayers);
    for (const other of others) this.fighter?.revealPlayer(other);
  }

  addWaitingPlayer(player: PlayerState, _readyIds?: string[]): void {
    if (!this.waitingRoster.some((entry) => entry.id === player.id)) {
      this.waitingRoster = [...this.waitingRoster, player];
    }
    if (this.pane === "result") {
      this.showWaitingAfterLeave();
      return;
    }
    const local = this.waitingLocal;
    if (!local) return;
    void this.showRoster(local, this.waitingRoster, this.matchSize, "reveal");
  }

  removeWaitingPlayer(playerId: string): void {
    this.waitingRoster = this.waitingRoster.filter((player) => player.id !== playerId);
    this.rematchReadyIds?.delete(playerId);
    required("#countdown-banner").hidden = true;
    required("#waiting-countdown").hidden = true;
    if (this.pane === "result") {
      this.showWaitingAfterLeave();
      return;
    }
    const local = this.waitingLocal;
    if (!local) {
      this.showWaiting(undefined, this.matchSize);
      return;
    }
    if (this.waitingRoster.length <= 1) {
      this.showWaiting(local.spawnIndex, this.matchSize);
      return;
    }
    void this.showRoster(local, this.waitingRoster, this.matchSize, "instant");
  }

  setReadyIds(readyIds: string[]): void {
    this.rematchReadyIds = new Set(readyIds);
    if (this.pane === "result") this.refreshRematch();
  }

  markLocalReady(): void {
    if (!this.waitingLocal || !this.rematchReadyIds) return;
    this.rematchReadyIds.add(this.waitingLocal.id);
    this.refreshRematch();
  }

  showCountdown(seconds: number): void {
    this.openMatch = false;
    this.startMatchButton.hidden = true;
    const banner = required("#countdown-banner");
    const readout = required("#waiting-countdown");
    const label = seconds > 0 ? String(seconds) : "Fight!";
    banner.hidden = false;
    banner.textContent = label;
    readout.hidden = false;
    readout.textContent = label;
    required("#waiting-title").textContent = "Get ready";
    required("#waiting-solo").hidden = true;
    required("#waiting-versus").hidden = false;
    if (this.pane === "result") {
      this.hideResultBanner();
      this.againButton.disabled = true;
      this.againButton.textContent = "Ready";
    }
  }

  showGame(): void {
    this.openMatch = false;
    this.startMatchButton.hidden = true;
    this.hideResultBanner();
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    required("#countdown-banner").hidden = true;
    this.setOverlay(false);
    this.hud.hidden = false;
  }

  showResult(
    winnerId: string | null,
    local?: PlayerState | null,
    players: PlayerState[] = [],
    maxPlayers: PlayerCount = this.matchSize,
    readyIds: string[] = [],
    placements: Record<string, number> = {},
  ): void {
    this.openMatch = false;
    this.startMatchButton.hidden = true;
    this.matchSize = maxPlayers;
    this.waitingLocal = local ?? this.waitingLocal;
    this.waitingRoster = players.length > 0 ? [...players] : this.waitingRoster;
    this.rematchReadyIds = new Set(readyIds);
    this.resultPlacements = { ...placements };
    this.resultWinnerId = winnerId;
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setSeeking(false);
    this.setMatchmakingMode(true);
    this.setResultBanner(winnerId, local?.id ?? this.waitingLocal?.id ?? null);
    required("#countdown-banner").hidden = true;
    required("#waiting-countdown").hidden = true;
    this.setPane("result");
    this.refreshRematch();
  }

  setPreview(
    profile: UserProfile | null,
    guestSession = this.guestSession,
    accountEmail = this.accountEmail,
  ): void {
    this.profile = profile;
    this.guestSession = Boolean(profile) && guestSession;
    this.accountEmail = accountEmail?.trim() || null;
    this.fighter?.setAvatar(profile?.avatar ?? null);
    if (!profile) this.fighter?.playMove("idle");
    this.syncPreviewName();
    this.updatePlayerCard();
  }

  updateHud(state: GameState): void {
    if (this.hud.hidden) return;
    const players = [...(state.snapshot?.players ?? [])].sort(
      (a, b) => a.spawnIndex - b.spawnIndex,
    );
    const key = players
      .map((player) => `${player.id}:${player.name}:${player.lives}:${Math.round(player.damagePercent)}:${player.avatar?.baseAvatarId ?? ""}`)
      .join("|");
    if (key === this.hudKey) return;
    this.hudKey = key;

    const maxPlayers = state.snapshot?.maxPlayers ?? players.length;
    for (const slot of this.hudSlots) {
      const player = players.find((entry) => entry.spawnIndex === slot.index);
      const { node, name, lives, percent } = slot;
      node.hidden = slot.index >= maxPlayers;
      if (!name || !lives || !percent) continue;
      if (!player) {
        name.textContent = "—";
        lives.textContent = "";
        percent.textContent = "";
        continue;
      }
      name.textContent = player.name;
      lives.textContent = "❤".repeat(Math.max(0, player.lives));
      percent.textContent = `${Math.round(player.damagePercent)}%`;
      percent.setAttribute(
        "style",
        `color:${FIGHTER_COLOR_HEX[fighterColorFromId(player.avatar?.baseAvatarId)]}`,
      );
    }
  }

  updateThrowCooldown(_state: GameState, _time: number): void {
    if (this.hud.hidden) return;
    for (const slot of this.hudSlots) {
      const cooldown = slot.throwCooldown;
      if (!cooldown) continue;
      cooldown.hidden = true;
      cooldown.style.removeProperty("--progress");
    }
  }

  onChooseGuest(handler: () => void): void {
    bindPress(this.chooseGuestButton, handler, this.directTapHandling);
  }

  onChooseLogin(handler: () => void): void {
    bindPress(this.chooseLoginButton, handler, this.directTapHandling);
  }

  onSignIn(handler: () => void): void {
    bindPress(this.signInButton, handler, this.directTapHandling);
  }

  onSignUp(handler: () => void): void {
    bindPress(this.signUpButton, handler, this.directTapHandling);
  }

  onBackToLanding(handler: () => void): void {
    bindPress(required("#back-login", HTMLButtonElement), handler, this.directTapHandling);
  }

  onBackFromEdit(handler: () => void): void {
    bindPress(
      this.backEditButton,
      () => {
        if (performance.now() < this.profileActionGuardUntil) return;
        handler();
      },
      this.directTapHandling,
    );
  }

  onJoin(handler: () => void): void {
    bindPress(this.joinButton, handler, this.directTapHandling);
  }

  onCancelWait(handler: () => void): void {
    bindPress(this.cancelWaitButton, handler, this.directTapHandling);
  }

  onStartMatch(handler: () => void): void {
    bindPress(this.startMatchButton, handler, this.directTapHandling);
  }

  onAgain(handler: () => void): void {
    bindPress(this.againButton, handler, this.directTapHandling);
  }

  private syncStartMatchButton(): void {
    const show = this.openMatch && this.pane === "waiting";
    this.startMatchButton.hidden = !show;
    this.startMatchButton.disabled = this.waitingRoster.length < 2;
  }

  onResultBack(handler: () => void): void {
    bindPress(required("#result-back", HTMLButtonElement), handler, this.directTapHandling);
  }

  onExitMatch(handler: () => void): void {
    bindPress(required("#exit-match", HTMLButtonElement), handler, this.directTapHandling);
  }

  onSignOut(handler: () => void): void {
    bindPress(
      this.signOutButton,
      () => {
        if (performance.now() < this.profileActionGuardUntil) return;
        this.toggleSignOutConfirm();
      },
      this.directTapHandling,
    );
    bindPress(
      required("#sign-out-confirm-yes", HTMLButtonElement),
      () => {
        this.closeSignOutConfirm();
        handler();
      },
      this.directTapHandling,
    );
  }

  onEditAvatar(handler: () => void): void {
    bindPress(
      this.editButton,
      () => {
        if (performance.now() < this.profileActionGuardUntil) return;
        handler();
      },
      this.directTapHandling,
    );
  }

  onSaveAvatar(handler: () => void): void {
    bindPress(
      this.saveAvatarButton,
      () => {
        if (performance.now() < this.profileActionGuardUntil) return;
        handler();
      },
      this.directTapHandling,
    );
  }

  onSelectColor(handler: (color: FighterColor) => void): void {
    this.onColorSelected = handler;
  }

  onSelectThrowable(handler: (throwableId: ThrowableId) => void): void {
    this.onThrowableSelected = handler;
  }

  onSelectFaceAccessory(handler: (accessoryId: string | null) => void): void {
    this.onAccessorySelected = handler;
  }

  rememberName(explicit?: string): void {
    const name = explicit?.trim() || this.profile?.displayName || this.displayName();
    if (name && name !== "Fighter") localStorage.setItem("tituah:name", name);
  }

  async shatterFrom(target: HTMLElement): Promise<void> {
    await shatterElement(this.lobbyOptions, target);
  }

  async slapToward(target: HTMLElement): Promise<void> {
    await this.playSlap(target, false);
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.lobbyOptions.classList.toggle("is-loading", loading);
    this.lobby.classList.toggle("is-loading", loading);
    this.editButton.disabled = loading;
    this.saveAvatarButton.disabled = loading;
    this.backEditButton.disabled = loading;
    this.fighter?.setLoading(loading);
  }

  setSeeking(seeking: boolean): void {
    this.lobby.classList.toggle("is-seeking", seeking);
    this.fighter?.setSeeking(seeking);
  }

  private setMatchmakingMode(active: boolean): void {
    this.lobby.classList.toggle("is-versus", active);
    required("#versus-cards").hidden = !active;
    if (!active) {
      required("#countdown-banner").hidden = true;
      this.waitingRoster = [];
      this.waitingLocal = null;
      this.rematchReadyIds = null;
      this.resultPlacements = {};
      this.resultWinnerId = null;
      this.syncVersusRoster([], 2);
      const extra = document.querySelector("#extra-platforms");
      if (extra instanceof HTMLElement) extra.hidden = true;
    }
    requestAnimationFrame(() => this.fighter?.layout());
  }

  private showWaitingAfterLeave(): void {
    this.hideResultBanner();
    this.resultWinnerId = null;
    this.rematchReadyIds = null;
    this.resultPlacements = {};
    this.againButton.disabled = false;
    this.againButton.textContent = "Play again";

    const local = this.waitingLocal;
    if (!local) {
      this.showWaiting(undefined, this.matchSize);
      return;
    }
    if (this.waitingRoster.length <= 1) {
      this.showWaiting(local.spawnIndex, this.matchSize);
      return;
    }
    void this.showRoster(local, this.waitingRoster, this.matchSize, "instant");
  }

  private refreshRematch(): void {
    const readyIds = this.rematchReadyIds ?? new Set<string>();
    const stands = buildPodiumStands(
      this.waitingRoster,
      this.matchSize,
      this.resultPlacements,
      readyIds,
    );
    this.syncPodium(stands);
    const local = this.waitingLocal;
    if (local) {
      requestAnimationFrame(() => {
        this.fighter?.setRematchRoster(local, stands, this.matchSize, this.resultWinnerId);
      });
    }
    this.updateResultCopy();
  }

  private syncPodium(stands: PodiumStand[]): void {
    for (let slot = 0; slot < 4; slot += 1) {
      const node = required(`.podium-slot[data-slot='${slot}']`);
      const stand = stands[slot];
      if (!stand) continue;
      node.dataset.place = String(stand.place);
      node.dataset.status = stand.status;
      required(`#podium-place-${slot}`).textContent = placeLabel(stand.place);
      if (stand.player) {
        required(`#podium-name-${slot}`).textContent = stand.player.name;
        required(`#podium-status-${slot}`).textContent = stand.status === "ready" ? "Ready" : "Not ready";
      } else {
        required(`#podium-name-${slot}`).textContent = "Waiting for player";
        required(`#podium-status-${slot}`).textContent = "Player left";
      }
    }
  }

  private updateResultCopy(): void {
    const readyIds = this.rematchReadyIds ?? new Set<string>();
    const localReady = Boolean(this.waitingLocal && readyIds.has(this.waitingLocal.id));
    this.againButton.disabled = localReady;
    this.againButton.textContent = localReady ? "Ready" : "Play again";
  }

  private setResultBanner(winnerId: string | null, localId: string | null): void {
    const banner = required("#result-banner");
    const outcome = required("#result-outcome");
    banner.hidden = false;
    if (winnerId && localId && winnerId === localId) {
      banner.dataset.outcome = "win";
      outcome.textContent = "You win!!!";
      return;
    }
    if (winnerId && localId) {
      banner.dataset.outcome = "lose";
      outcome.textContent = "You lose.";
      return;
    }
    banner.dataset.outcome = "draw";
    outcome.textContent = "Match over";
  }

  private hideResultBanner(): void {
    required("#result-banner").hidden = true;
  }

  private syncVersusRoster(
    players: PlayerState[],
    maxPlayers: PlayerCount,
    readyIds?: Set<string> | null,
  ): void {
    const cards = required("#versus-cards");
    cards.dataset.size = String(maxPlayers);
    const bySlot = new Map(players.map((player) => [player.spawnIndex, player]));
    for (let slot = 0; slot < 4; slot += 1) {
      const card = required(`.versus-card[data-slot='${slot}']`);
      const name = required(`#versus-name-${slot}`);
      card.hidden = slot >= maxPlayers;
      if (slot >= maxPlayers) continue;
      const player = bySlot.get(slot);
      if (!player) {
        name.textContent = "Waiting…";
        card.dataset.state = "waiting";
        continue;
      }
      name.textContent = player.name;
      if (readyIds && !readyIds.has(player.id)) {
        card.dataset.state = "pending";
      } else {
        card.dataset.state = "ready";
      }
    }
  }

  private applyWaitingSlot(slot: number): void {
    const chip = required("#waiting-slot");
    chip.dataset.slot = String(slot);
    chip.textContent = `Joining as Player ${slot + 1}`;
  }

  private applyWaitingSlotPending(): void {
    const chip = required("#waiting-slot");
    chip.removeAttribute("data-slot");
    chip.textContent = "Finding match…";
  }

  private renderColorPicker(profile: UserProfile | null): void {
    this.colorGrid.replaceChildren();
    if (!profile) {
      this.editorHint.hidden = false;
      this.editorHint.textContent = "Play as guest or log in to edit and save your fighter.";
      return;
    }

    this.editorHint.hidden = true;
    this.editorHint.textContent = "";
    const level = profile.progression.level;
    this.selectedColor = fighterColorFromId(profile.avatar.baseAvatarId);
    if (!isColorUnlocked(level, this.selectedColor)) {
      this.selectedColor = "orange";
    }

    FIGHTER_COLORS.forEach((color, index) => {
      const cup = FIGHTER_VARIANT_CUPS[index];
      const col = index % 6;
      const row = Math.floor(index / 6);
      const unlocked = isColorUnlocked(level, color);
      const unlockAt = colorUnlockLevel(color);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.dataset.color = color;
      button.dataset.variant = String(index);
      button.dataset.locked = String(!unlocked);
      if (!unlocked) button.dataset.unlockTip = `Unlocks at level ${unlockAt}`;
      else delete button.dataset.unlockTip;
      button.disabled = false;
      button.setAttribute("aria-disabled", String(!unlocked));
      button.style.setProperty("--cup-x", `${cup.x}%`);
      button.style.setProperty("--cup-y", `${cup.y}%`);
      button.style.setProperty("--variant-x", `${(col / 5) * 100}%`);
      button.style.setProperty("--variant-y", `${row * 100}%`);
      button.setAttribute("aria-label", unlocked ? color : `${color} — unlocks at level ${unlockAt}`);
      button.title = unlocked ? color[0].toUpperCase() + color.slice(1) : "";
      const icon = document.createElement("span");
      icon.className = "color-swatch-icon";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      if (!unlocked) button.append(this.createLockBadge());
      this.colorGrid.append(button);
    });
    this.syncColorButtons();
  }

  private renderThrowablePicker(profile: UserProfile | null): void {
    this.throwableGrid.replaceChildren();
    if (!profile) return;

    const level = profile.progression.level;
    this.selectedThrowable = throwableIdFromAvatar(profile.avatar.throwableId);
    if (!isThrowableUnlocked(level, this.selectedThrowable)) {
      this.selectedThrowable = "sandal";
    }
    for (const id of THROWABLE_IDS) {
      const unlocked = isThrowableUnlocked(level, id);
      const unlockAt = throwableUnlockLevel(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "throwable-swatch";
      button.dataset.throwable = id;
      button.dataset.locked = String(!unlocked);
      if (!unlocked) button.dataset.unlockTip = `Unlocks at level ${unlockAt}`;
      else delete button.dataset.unlockTip;
      button.disabled = false;
      button.setAttribute("aria-disabled", String(!unlocked));
      button.setAttribute(
        "aria-label",
        unlocked ? THROWABLE_LABELS[id] : `${THROWABLE_LABELS[id]} — unlocks at level ${unlockAt}`,
      );
      button.title = unlocked ? THROWABLE_LABELS[id] : "";
      const icon = document.createElement("span");
      icon.className = "throwable-swatch-icon";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      if (!unlocked) button.append(this.createLockBadge());
      this.throwableGrid.append(button);
    }
    this.syncThrowableButtons();
  }

  private renderFaceAccessoryPicker(profile: UserProfile | null): void {
    this.faceAccessoryGrid.replaceChildren();
    if (!profile) return;

    const level = profile.progression.level;
    this.selectedAccessoryId = bakedAccessoryIdFromAvatar(profile.avatar);
    if (this.selectedAccessoryId && !isAccessoryUnlocked(level, this.selectedAccessoryId)) {
      this.selectedAccessoryId = null;
    }
    for (const accessory of BAKED_ACCESSORIES) {
      const unlocked = isAccessoryUnlocked(level, accessory.id);
      const unlockAt = accessoryUnlockLevel(accessory.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "face-swatch";
      button.dataset.face = accessory.id;
      button.dataset.locked = String(!unlocked);
      if (!unlocked) button.dataset.unlockTip = `Unlocks at level ${unlockAt}`;
      else delete button.dataset.unlockTip;
      button.disabled = false;
      button.setAttribute("aria-disabled", String(!unlocked));
      button.setAttribute(
        "aria-label",
        unlocked ? accessory.label : `${accessory.label} — unlocks at level ${unlockAt}`,
      );
      button.title = unlocked ? accessory.label : "";
      const icon = document.createElement("span");
      icon.className = "face-swatch-icon";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      if (!unlocked) button.append(this.createLockBadge());
      this.faceAccessoryGrid.append(button);
    }
    this.syncFaceAccessoryButtons();
  }

  private createLockBadge(): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "cosmetic-lock";
    badge.setAttribute("aria-hidden", "true");
    badge.append(
      createElement(Lock, {
        width: 14,
        height: 14,
        "stroke-width": 2.4,
        class: "cosmetic-lock-icon",
      }),
    );
    return badge;
  }

  private syncColorButtons(): void {
    for (const button of this.colorGrid.querySelectorAll<HTMLButtonElement>("[data-color]")) {
      const selected = button.dataset.color === this.selectedColor;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("role", "radio");
    }
  }

  private syncThrowableButtons(): void {
    for (const button of this.throwableGrid.querySelectorAll<HTMLButtonElement>("[data-throwable]")) {
      const selected = button.dataset.throwable === this.selectedThrowable;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("role", "radio");
    }
  }

  private syncFaceAccessoryButtons(): void {
    for (const button of this.faceAccessoryGrid.querySelectorAll<HTMLButtonElement>("[data-face]")) {
      const selected = button.dataset.face === this.selectedAccessoryId;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("role", "radio");
    }
  }

  private avatarWithLoadout(overrides: {
    baseAvatarId?: string;
    throwableId?: ThrowableId;
    accessoryId?: string | null;
  }) {
    const accessoryId =
      overrides.accessoryId !== undefined ? overrides.accessoryId : this.selectedAccessoryId;
    const next = {
      ...(this.profile?.avatar ?? emptyAvatar()),
      baseAvatarId: overrides.baseAvatarId ?? this.selectedColor,
      throwableId: overrides.throwableId ?? this.selectedThrowable,
    };
    for (const field of BAKED_ACCESSORY_FIELDS) next[field] = null;
    if (accessoryId) {
      const def = BAKED_ACCESSORIES.find((accessory) => accessory.id === accessoryId);
      if (def) next[def.field] = accessoryId;
    }
    return next;
  }

  private async selectColor(color: FighterColor, animate = false): Promise<void> {
    const level = this.profile?.progression.level ?? 1;
    if (!isColorUnlocked(level, color)) return;
    if (color === this.selectedColor) return;
    this.selectedColor = color;
    this.syncColorButtons();
    const avatar = this.avatarWithLoadout({ baseAvatarId: color });
    if (this.profile) this.profile = { ...this.profile, avatar };
    this.onColorSelected(color);
    if (!animate) {
      this.fighter?.setAvatar(avatar);
      return;
    }
    const request = ++this.editPreviewToken;
    this.slapping = true;
    await this.playJump(() => {
      if (request !== this.editPreviewToken) return;
      this.fighter?.setAvatar(avatar);
    });
    this.slapping = false;
  }

  private async selectThrowable(throwableId: ThrowableId, animate = false): Promise<void> {
    const level = this.profile?.progression.level ?? 1;
    if (!isThrowableUnlocked(level, throwableId)) return;
    if (throwableId === this.selectedThrowable) return;
    this.selectedThrowable = throwableId;
    this.syncThrowableButtons();
    const avatar = this.avatarWithLoadout({ throwableId });
    if (this.profile) this.profile = { ...this.profile, avatar };
    this.onThrowableSelected(throwableId);
    this.fighter?.setAvatar(avatar);
    if (!animate) return;
    const request = ++this.editPreviewToken;
    this.slapping = true;
    this.setActiveMove("throw");
    if (this.fighter) {
      await this.fighter.throwItem();
    }
    if (request === this.editPreviewToken) this.setActiveMove("throw");
    this.slapping = false;
  }

  private async selectAccessory(accessoryId: string | null, animate = false): Promise<void> {
    const level = this.profile?.progression.level ?? 1;
    if (accessoryId && !isAccessoryUnlocked(level, accessoryId)) return;
    if (accessoryId === this.selectedAccessoryId) return;
    this.selectedAccessoryId = accessoryId;
    this.syncFaceAccessoryButtons();
    const avatar = this.avatarWithLoadout({ accessoryId });
    if (this.profile) this.profile = { ...this.profile, avatar };
    this.onAccessorySelected(accessoryId);
    this.fighter?.setAvatar(avatar);
    if (!animate) return;
    const request = ++this.editPreviewToken;
    this.slapping = true;
    await this.playJump(() => {
      if (request !== this.editPreviewToken) return;
      this.fighter?.setAvatar(avatar);
    });
    this.slapping = false;
  }

  private async slapThen(target: HTMLElement, handler: () => void, shatter = true): Promise<void> {
    if (this.slapping) return;
    this.slapping = true;
    await this.playSlap(target, shatter);
    this.slapping = false;
    handler();
  }

  private async jumpThen(handler: () => void): Promise<void> {
    if (this.slapping) return;
    this.slapping = true;
    await this.playJump(handler);
    this.slapping = false;
  }

  private async shatterThen(target: HTMLElement, handler: () => void): Promise<void> {
    if (this.slapping) return;
    this.slapping = true;
    await shatterElement(this.lobbyOptions, target);
    this.slapping = false;
    handler();
  }

  private async playSlap(target: HTMLElement, shatter = true): Promise<void> {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      audio.play("uiSlap");
      if (shatter) audio.play("uiShatter");
      return;
    }
    if (this.fighter) {
      await this.fighter.slap(target, shatter ? () => shatterElement(this.lobbyOptions, target) : undefined);
      return;
    }
    audio.play("uiSlap");
    target.classList.add("is-hit");
    if (shatter) await shatterElement(this.lobbyOptions, target);
    target.classList.remove("is-hit");
  }

  private async playJump(onApex?: () => void): Promise<void> {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      audio.play("jump");
      onApex?.();
      return;
    }
    if (this.fighter) {
      await this.fighter.jump(onApex);
      return;
    }
    audio.play("jump");
    onApex?.();
  }

  private setPane(pane: LobbyPane): void {
    const wasEditing = this.pane === "edit";
    const willEdit = pane === "edit";
    this.pane = pane;
    for (const name of ["landing", "login", "menu", "waiting", "result", "edit"] as const) {
      required(`#pane-${name}`).hidden = name !== pane;
    }
    this.lobbyOptions.classList.remove("is-shattering");
    this.lobby.classList.toggle("is-result", pane === "result");
    this.landingError.hidden = true;
    this.authError.hidden = true;
    this.menuError.hidden = true;
    this.editError.hidden = true;
    if (pane !== "result") this.hideResultBanner();
    this.setAccountTipOpen(false);
    this.closeSignOutConfirm();
    this.fighter?.setDemoKeyboardEnabled(
      pane === "edit" || pane === "menu",
      (move) => this.setActiveMove(move),
    );
    required("#control-legend-wrap").hidden = pane !== "menu" && pane !== "edit";
    // Edit↔Save and Back↔Sign out share slots; block the replacement control until
    // the originating tap's ghost click has finished (common on touch / small screens).
    if (wasEditing !== willEdit) {
      this.profileActionGuardUntil = performance.now() + 500;
      this.armSwapControl(willEdit ? this.saveAvatarButton : this.editButton);
      this.armSwapControl(willEdit ? this.backEditButton : this.signOutButton);
    }
    this.updatePlayerCard();
    requestAnimationFrame(() => this.fighter?.layout());
  }

  /** Keep a newly shown swap control from receiving the same tap that revealed it. */
  private armSwapControl(button: HTMLButtonElement): void {
    button.style.pointerEvents = "none";
    window.setTimeout(() => {
      if (!button.hidden) button.style.pointerEvents = "";
    }, 500);
  }

  private setPaneError(error?: string): void {
    const node =
      this.pane === "login" ? this.authError : this.pane === "landing" ? this.landingError : this.menuError;
    this.setError(node, error);
  }

  private updatePlayerCard(): void {
    const locked = !this.profile;
    const editing = this.pane === "edit";
    const waiting = this.pane === "waiting";
    const result = this.pane === "result";
    const onAuth = this.pane === "landing" || this.pane === "login";
    // Waiting keeps the profile strip for leave + account status (no edit control).
    const showProfile = !locked && !result && !onAuth;
    const showLocked = locked && !onAuth && !waiting && !result && !editing;
    required("#player-card-locked").hidden = !showLocked;
    required("#player-card-profile").hidden = !showProfile;
    required("#player-card-waiting").hidden = true;
    required("#player-card-result").hidden = !result;
    required("#player-card-moves").hidden = true;
    this.cancelWaitButton.hidden = !waiting || !showProfile;
    this.editButton.hidden = this.pane !== "menu" || !showProfile;
    this.saveAvatarButton.hidden = !editing || !showProfile;
    // Collapse the whole Edit/Save slot while waiting (not just hide the buttons).
    this.profileActionSlot.hidden = this.editButton.hidden && this.saveAvatarButton.hidden;
    const showJoystickToggle =
      document.documentElement.classList.contains("has-touch")
      && (editing || this.pane === "menu")
      && showProfile;
    this.joystickToggle.hidden = !showJoystickToggle;
    this.backEditButton.hidden = !editing;
    this.signOutButton.hidden = locked || onAuth || editing;
    this.syncStartMatchButton();
    this.playerCard.classList.toggle("is-locked", showLocked);
    this.playerCard.classList.toggle("is-bare", onAuth);
    this.playerCard.classList.toggle("is-waiting", waiting);
    this.playerCard.classList.toggle("is-result", result);
    this.lobby.classList.toggle("is-signed-out", locked || onAuth);
    this.syncPreviewControls();
    if (!showProfile) {
      this.setAccountTipOpen(false);
      return;
    }
    this.playerStats.textContent =
      `Lv ${this.profile!.progression.level} · ${this.profile!.stats.wins}W ${this.profile!.stats.losses}L`;
    this.syncAccountStatus();
  }

  private bindAccountStatus(): void {
    this.accountStatus.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setAccountTipOpen(!this.accountTipOpen);
    });
    document.addEventListener("click", (event) => {
      if (!this.accountTipOpen) return;
      const target = event.target as Node | null;
      if (this.accountStatus.contains(target) || this.accountStatusTip.contains(target)) return;
      this.setAccountTipOpen(false);
    });
  }

  private syncAccountStatus(): void {
    const linked = Boolean(this.profile) && !this.guestSession;
    this.accountStatus.dataset.state = linked ? "linked" : "guest";
    this.accountStatus.setAttribute(
      "aria-label",
      linked ? "Progress saved" : "Progress not saved",
    );
    if (linked) {
      const email = this.accountEmail || "your account";
      this.accountStatusTip.textContent = `Progress saved to: ${email}`;
    } else {
      this.accountStatusTip.textContent = "Progress not saved: Guest";
    }
  }

  private setAccountTipOpen(open: boolean): void {
    this.accountTipOpen = open;
    this.accountStatus.setAttribute("aria-expanded", String(open));
    this.accountStatusTip.hidden = !open;
  }

  private syncPreviewName(): void {
    if (this.pane === "edit" && this.displayNameInput.value.trim()) {
      this.setPreviewName(this.displayNameInput.value.trim());
      return;
    }
    this.setPreviewName(this.profile?.displayName || "Fighter");
  }

  private setPreviewName(name: string): void {
    this.previewName.textContent = name || "Fighter";
  }

  private setActiveMove(move: LobbyDemoMove): void {
    for (const button of this.playerCard.querySelectorAll<HTMLButtonElement>("[data-demo-move]")) {
      button.classList.toggle("is-active", button.dataset.demoMove === move);
    }
  }

  private bindJoystickToggle(): void {
    this.mountJoystickIcons();
    this.applyJoystickVisible(readJoystickVisible());
    this.joystickToggle.addEventListener("click", () => {
      this.applyJoystickVisible(!readJoystickVisible());
    });
  }

  private mountJoystickIcons(): void {
    const iconAttrs = {
      width: 18,
      height: 18,
      "stroke-width": 2,
      "aria-hidden": "true",
    } as const;
    const shown = createElement(Gamepad2, { ...iconAttrs, class: "icon-joystick" });
    const hidden = document.createElement("span");
    hidden.className = "icon-joystick-off";
    hidden.setAttribute("aria-hidden", "true");
    hidden.append(
      createElement(Gamepad2, { ...iconAttrs, class: "icon-joystick-off-pad" }),
      createElement(X, { ...iconAttrs, class: "icon-joystick-off-x" }),
    );
    this.joystickToggle.replaceChildren(shown, hidden);
  }

  private applyJoystickVisible(visible: boolean): void {
    writeJoystickVisible(visible);
    this.joystickToggle.dataset.state = visible ? "shown" : "hidden";
    this.joystickToggle.setAttribute("aria-pressed", String(visible));
    this.joystickToggle.setAttribute(
      "aria-label",
      visible ? "Hide on-screen controls" : "Show on-screen controls",
    );
    this.joystickToggle.title = visible ? "Hide on-screen controls" : "Show on-screen controls";
    this.syncPreviewControls();
  }

  /** Preview-only: show touch controls in lobby/menu/edit so players can practice. */
  private syncPreviewControls(): void {
    const inLobbyPreview = this.pane === "edit" || this.pane === "menu";
    const controlsVisible = readJoystickVisible();
    const previewOn = inLobbyPreview && controlsVisible;
    document.documentElement.classList.toggle("preview-controls-on", previewOn);
    // Match visibility is owned by setOverlay / touch-controls-on — never hide match pads here.
    if (this.overlay.dataset.hidden === "true") return;
    const touch = document.getElementById("touch-controls");
    if (touch) touch.setAttribute("aria-hidden", previewOn ? "false" : "true");
  }

  private bindMixer(): void {
    this.muteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleMixer(this.muteButton);
    });
    this.hudAudioButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleMixer(this.hudAudioButton);
    });
    this.hudExitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleExitConfirm();
    });
    for (const button of this.mixer.querySelectorAll<HTMLButtonElement>("[data-audio-enabled]")) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const bus = button.dataset.audioEnabled;
        if (bus !== "music" && bus !== "sfx") return;
        audio.toggleEnabled(bus);
      });
    }
    for (const slider of this.mixer.querySelectorAll<HTMLInputElement>("[data-audio-volume]")) {
      slider.addEventListener("input", () => {
        const bus = slider.dataset.audioVolume;
        if (bus !== "music" && bus !== "sfx") return;
        audio.setVolume(bus, Number(slider.value) / 100);
      });
    }
    this.mixer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeMixer();
        return;
      }
      event.stopPropagation();
    });
    this.exitConfirm.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeExitConfirm();
        return;
      }
      event.stopPropagation();
    });
    this.signOutConfirm.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeSignOutConfirm();
        return;
      }
      event.stopPropagation();
    });
    required("#exit-stay", HTMLButtonElement).addEventListener("click", () => this.closeExitConfirm());
    required("#sign-out-stay", HTMLButtonElement).addEventListener("click", () => this.closeSignOutConfirm());
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.mixerOpen) {
        if (this.mixer.contains(target) || this.muteButton.contains(target) || this.hudAudioButton.contains(target)) {
          return;
        }
        this.closeMixer();
      }
      if (this.exitConfirmOpen) {
        if (this.exitConfirm.contains(target) || this.hudExitButton.contains(target)) return;
        this.closeExitConfirm();
      }
      if (this.signOutConfirmOpen) {
        if (this.signOutConfirm.contains(target) || this.signOutButton.contains(target)) return;
        this.closeSignOutConfirm();
      }
    });
    window.addEventListener("resize", () => {
      this.placeMixer();
      this.placeExitConfirm();
      this.placeSignOutConfirm();
    });
    audio.onMuteChange(() => this.syncMixer());
    this.syncMixer();
  }

  private toggleMixer(anchor: HTMLButtonElement): void {
    if (this.mixerOpen && this.mixerAnchor === anchor) {
      this.closeMixer();
      return;
    }
    this.openMixer(anchor);
  }

  private openMixer(anchor: HTMLButtonElement): void {
    this.closeExitConfirm();
    this.closeSignOutConfirm();
    this.mixerOpen = true;
    this.mixerAnchor = anchor;
    this.mixer.hidden = false;
    this.syncMixer();
    this.placeMixer();
    void audio.unlock();
  }

  private closeMixer(): void {
    this.mixerOpen = false;
    this.mixerAnchor = null;
    this.mixer.hidden = true;
    this.syncMixer();
  }

  private toggleExitConfirm(): void {
    if (this.exitConfirmOpen) {
      this.closeExitConfirm();
      return;
    }
    this.openExitConfirm();
  }

  private openExitConfirm(): void {
    this.closeMixer();
    this.closeSignOutConfirm();
    this.exitConfirmOpen = true;
    this.exitConfirm.hidden = false;
    this.hudExitButton.setAttribute("aria-expanded", "true");
    this.placeExitConfirm();
  }

  private closeExitConfirm(): void {
    this.exitConfirmOpen = false;
    this.exitConfirm.hidden = true;
    this.hudExitButton.setAttribute("aria-expanded", "false");
  }

  private toggleSignOutConfirm(): void {
    if (this.signOutConfirmOpen) {
      this.closeSignOutConfirm();
      return;
    }
    this.openSignOutConfirm();
  }

  private openSignOutConfirm(): void {
    this.closeMixer();
    this.closeExitConfirm();
    this.signOutConfirmOpen = true;
    this.signOutConfirm.hidden = false;
    this.signOutButton.setAttribute("aria-expanded", "true");
    this.placeSignOutConfirm();
  }

  private closeSignOutConfirm(): void {
    this.signOutConfirmOpen = false;
    this.signOutConfirm.hidden = true;
    this.signOutButton.setAttribute("aria-expanded", "false");
  }

  private placeMixer(): void {
    if (!this.mixerOpen || !this.mixerAnchor) return;
    const rect = this.mixerAnchor.getBoundingClientRect();
    const width = this.mixer.offsetWidth;
    const height = this.mixer.offsetHeight;
    const gap = 8;
    const alignCenter = this.mixerAnchor === this.hudAudioButton;
    let left = alignCenter ? rect.left + rect.width / 2 - width / 2 : rect.right - width;
    let top = rect.bottom + gap;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - gap);
    this.mixer.style.left = `${Math.round(left)}px`;
    this.mixer.style.top = `${Math.round(top)}px`;
  }

  private placeExitConfirm(): void {
    if (!this.exitConfirmOpen) return;
    const rect = this.hudExitButton.getBoundingClientRect();
    const width = this.exitConfirm.offsetWidth;
    const height = this.exitConfirm.offsetHeight;
    const gap = 8;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + gap;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - gap);
    this.exitConfirm.style.left = `${Math.round(left)}px`;
    this.exitConfirm.style.top = `${Math.round(top)}px`;
  }

  private placeSignOutConfirm(): void {
    if (!this.signOutConfirmOpen) return;
    const rect = this.signOutButton.getBoundingClientRect();
    const width = this.signOutConfirm.offsetWidth;
    const height = this.signOutConfirm.offsetHeight;
    const gap = 8;
    let left = rect.right - width;
    let top = rect.bottom + gap;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - gap);
    this.signOutConfirm.style.left = `${Math.round(left)}px`;
    this.signOutConfirm.style.top = `${Math.round(top)}px`;
  }

  private syncMixer(): void {
    const muted = audio.isMuted();
    this.syncSoundButton(this.muteButton, muted);
    this.syncSoundButton(this.hudAudioButton, muted);
    for (const bus of ["music", "sfx"] as const) {
      const enabled = audio.isEnabled(bus);
      const toggle = this.mixer.querySelector<HTMLButtonElement>(`[data-audio-enabled="${bus}"]`);
      const slider = this.mixer.querySelector<HTMLInputElement>(`[data-audio-volume="${bus}"]`);
      const row = toggle?.closest(".audio-mixer-row");
      if (toggle) {
        toggle.setAttribute("aria-pressed", String(enabled));
        toggle.textContent = enabled ? "On" : "Off";
      }
      if (slider) {
        slider.value = String(Math.round(audio.getVolume(bus) * 100));
        slider.disabled = !enabled;
      }
      row?.classList.toggle("is-off", !enabled);
    }
  }

  private syncSoundButton(button: HTMLButtonElement, muted: boolean): void {
    const open = this.mixerOpen && this.mixerAnchor === button;
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close sound" : "Sound");
    button.title = "Sound";
  }

  private setError(node: HTMLElement, error?: string): void {
    node.hidden = !error;
    node.textContent = error ?? "";
  }

  private setOverlay(visible: boolean): void {
    this.closeMixer();
    this.closeExitConfirm();
    this.overlay.dataset.hidden = visible ? "false" : "true";
    const inMatch = !visible;
    document.documentElement.classList.toggle("touch-controls-on", inMatch);
    const touch = document.getElementById("touch-controls");
    if (touch) {
      if (inMatch) touch.setAttribute("aria-hidden", "false");
      else this.syncPreviewControls();
    }
    this.fighter?.setActive(visible);
  }
}

function isDemoMove(value: string): value is LobbyDemoMove {
  return DEMO_MOVES.has(value as LobbyDemoMove);
}

function placeLabel(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return "4th";
}

function podiumPlaces(count: PlayerCount): number[] {
  if (count <= 1) return [1];
  if (count === 2) return [2, 1];
  if (count === 3) return [2, 1, 3];
  return [2, 1, 3, 4];
}

function buildPodiumStands(
  players: PlayerState[],
  maxPlayers: PlayerCount,
  placements: Record<string, number>,
  readyIds: Set<string>,
): PodiumStand[] {
  const byPlace = new Map<number, PlayerState>();
  const unplaced: PlayerState[] = [];
  for (const player of players) {
    const place = placements[player.id];
    if (place >= 1 && place <= maxPlayers && !byPlace.has(place)) byPlace.set(place, player);
    else unplaced.push(player);
  }
  let nextJoiner = 0;
  return podiumPlaces(maxPlayers).map((place) => {
    const placed = byPlace.get(place) ?? null;
    const player = placed ?? unplaced[nextJoiner++] ?? null;
    if (!player) return { place, player: null, status: "left" };
    return {
      place,
      player,
      status: readyIds.has(player.id) ? "ready" : "pending",
    };
  });
}

function required(selector: string): HTMLElement;
function required<T extends typeof HTMLElement>(selector: string, type: T): InstanceType<T>;
function required(selector: string, type?: typeof HTMLElement): HTMLElement {
  const node = document.querySelector(selector);
  if (!node || (type && !(node instanceof type))) {
    throw new Error(`Missing ${selector}`);
  }
  return node as HTMLElement;
}

function bindPress(
  button: HTMLButtonElement,
  handler: () => void,
  includePointerUp: boolean,
): void {
  let lastPointerUp = 0;
  if (includePointerUp) {
    button.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      lastPointerUp = Date.now();
      handler();
    });
  }
  button.addEventListener("click", () => {
    if (includePointerUp && Date.now() - lastPointerUp < 400) return;
    handler();
  });
}
