import {
  AVATAR_FIELD_TO_SLOT,
  isStageId,
  SLOT_TO_AVATAR_FIELD,
  type AvatarConfiguration,
  type InventoryItem,
  type ItemSlot,
  type StageId,
  type UserInventoryItem,
  type PlayerState,
  type UserProfile,
} from "@tituah/shared";
import type { GameState } from "./game/game-state.js";
import {
  LobbyFighterPreview,
  type LobbyDemoMove,
} from "./rendering/lobby-fighter-preview.js";
import { STAGE_VISUALS } from "./rendering/stages/stage-config.js";
import { shatterElement } from "./shatter-pane.js";

type LobbyPane = "landing" | "login" | "menu" | "waiting" | "result" | "edit";

const DEMO_MOVES = new Set<LobbyDemoMove>(["idle", "run", "jump", "slap", "hit"]);

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
  readonly menuKind = required("#menu-kind");
  readonly menuBlurb = required("#menu-blurb");
  readonly editorHint = required("#editor-hint");
  readonly lockerGrid = required("#locker-grid");
  readonly editButton = required("#edit-avatar", HTMLButtonElement);
  readonly saveAvatarButton = required("#save-avatar", HTMLButtonElement);
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
  readonly stageButtons = document.querySelectorAll<HTMLButtonElement>("[data-stage]");

  private pane: LobbyPane = "landing";
  private paneBeforeEdit: LobbyPane = "landing";
  private slapping = false;
  private loading = false;
  private editPreviewToken = 0;
  private guestSession = false;
  private previewItems: InventoryItem[] = [];
  private lockerInventory: UserInventoryItem[] = [];
  private onEquipItem: (itemId: string) => void = () => undefined;
  private onUnequipItem: (slot: ItemSlot) => void = () => undefined;
  private profile: UserProfile | null = null;
  private fighter?: LobbyFighterPreview;
  private selectedStage: StageId = "barnyard";
  private hudKey = "";
  private readonly hudSlots = [...this.hud.querySelectorAll<HTMLElement>(".fighter")].map((slot) => ({
    index: Number(slot.dataset.slot),
    name: slot.querySelector(".name"),
    lives: slot.querySelector(".lives"),
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

  constructor() {
    const stored = localStorage.getItem("tituah:name");
    if (stored) this.loginNameInput.value = stored;
    for (const button of this.stageButtons) {
      button.addEventListener("click", () => {
        const id = button.dataset.stage;
        if (!isStageId(id)) return;
        this.selectStage(id);
      });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preview-slot]")) {
      button.addEventListener("click", () => {
        const slot = Number(button.dataset.previewSlot);
        if (slot !== 0 && slot !== 1) return;
        this.setEditPreviewSlot(slot, true);
      });
    }
    this.displayNameInput.addEventListener("input", () => {
      if (this.pane === "edit") this.setPreviewName(this.displayNameInput.value.trim() || "Fighter");
    });
    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.signInButton.click();
    });
    this.displayNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.saveAvatarButton.click();
    });
    this.selectStage(this.selectedStage);
    required("#lobby").addEventListener(
      "click",
      (event) => {
        const button = (event.target as HTMLElement | null)?.closest("button");
        if (!button || button.disabled || this.loading) return;
        if (button.dataset.slapReplay === "true") return;
        // Preview-slot: tint only + in-place slap (handled below) — never shatter or flip facing.
        if (button.dataset.previewSlot != null) return;
        const demo = button.dataset.demoMove;
        if (demo && isDemoMove(demo)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.setActiveMove(demo);
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
        // Stage / attire: slap toward the control, keep the panel open (no shatter).
        if (button.dataset.stage || button.classList.contains("item-card")) {
          void this.slapThen(button, replay, false);
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

  async startFighterPreview(): Promise<void> {
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

  stageId(): StageId {
    return this.selectedStage;
  }

  private selectStage(stageId: StageId): void {
    this.selectedStage = stageId;
    for (const entry of this.stageButtons) {
      entry.dataset.selected = String(entry.dataset.stage === stageId);
    }
    const url = STAGE_VISUALS[stageId].background;
    this.characterStageBackdrop.style.setProperty("--stage-backdrop", `url("${url}")`);
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

  showMenu(profile?: UserProfile | null, error?: string, guestSession = this.guestSession): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPreview(profile ?? this.profile, this.previewItems, guestSession);
    this.setPane("menu");
    this.setPaneError(error);
  }

  showLocker(
    profile: UserProfile | null,
    items: InventoryItem[],
    inventory: UserInventoryItem[],
    onEquip: (itemId: string) => void,
    onUnequip: (slot: ItemSlot) => void,
    error?: string,
  ): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    this.setOverlay(true);
    if (this.pane !== "edit") this.paneBeforeEdit = this.pane;
    this.lockerInventory = inventory;
    this.onEquipItem = onEquip;
    this.onUnequipItem = onUnequip;
    this.setPreview(profile, items, this.guestSession);
    this.displayNameInput.value = profile?.displayName ?? "";
    this.setPane("edit");
    this.setEditPreviewSlot(0);
    this.renderLocker(profile, items, inventory, onEquip, onUnequip);
    this.setError(this.editError, error);
    this.setActiveMove("idle");
    this.displayNameInput.focus();
  }

  setLockerError(error?: string): void {
    this.setError(this.editError, error);
  }

  closeEditor(): void {
    this.setEditPreviewSlot(0);
    this.fighter?.playMove("idle");
    this.setActiveMove("idle");
    const previous = this.paneBeforeEdit;
    if (previous === "menu") this.showMenu(this.profile);
    else if (previous === "login") this.showLogin();
    else this.showAuth();
  }

  showWaiting(slot?: 0 | 1): void {
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setSeeking(true);
    this.setMatchmakingMode(true);
    if (slot === undefined) this.applyWaitingSlotPending();
    else this.applyWaitingSlot(slot);
    required("#waiting-solo").hidden = false;
    required("#waiting-versus").hidden = true;
    required("#waiting-countdown").hidden = true;
    required("#waiting-title").textContent = "Waiting for opponent";
    required("#platform-waiting-title").textContent = "Waiting for opponent";
    required("#platform-waiting-blurb").textContent =
      slot === 1
        ? "You’re Player 2 — hold while the roster locks in."
        : "Hold your charge — an opponent will appear on the right.";
    this.setVersusNames(
      this.profile?.displayName ?? "You",
      "Waiting for opponent",
      slot === 1 ? "pending" : "ready",
      "waiting",
    );
    this.setPane("waiting");
    if (this.profile) {
      const spawnIndex = (slot ?? 0) as 0 | 1;
      const local: PlayerState = {
        id: this.profile.uid,
        name: this.profile.displayName,
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
        avatar: this.profile.avatar,
      };
      // Before welcome, and for P1 alone: expanded ghost layout.
      this.fighter?.setWaitingGhost({ ...local, spawnIndex: 0, facing: 1 });
    }
  }

  async showVersus(
    local: PlayerState,
    opponent: PlayerState,
    entrance: "p1-reveal" | "p2-run" | "instant" = "instant",
  ): Promise<void> {
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setSeeking(false);
    this.setMatchmakingMode(true);
    this.applyWaitingSlot(local.spawnIndex === 0 ? 0 : 1);
    required("#waiting-solo").hidden = true;
    required("#waiting-versus").hidden = false;
    required("#waiting-countdown").hidden = true;
    required("#waiting-title").textContent = "Match found";
    required("#platform-waiting-title").textContent = "Match found";
    required("#platform-waiting-blurb").textContent = "Both fighters are ready — countdown starting.";

    const left = local.spawnIndex <= opponent.spawnIndex ? local : opponent;
    const right = local.spawnIndex <= opponent.spawnIndex ? opponent : local;

    if (entrance === "p2-run") {
      this.setVersusNames("…", local.name, "pending", "pending");
      this.setPane("waiting");
      await this.fighter?.enterAsPlayer2(local, opponent);
      this.setVersusNames(left.name, right.name, "ready", "ready");
      required("#platform-waiting-title").textContent = "Match found";
      required("#platform-waiting-blurb").textContent = `${left.name} vs ${right.name}`;
      return;
    }

    this.setVersusNames(left.name, right.name, "ready", "ready");
    required("#platform-waiting-title").textContent = "Match found";
    required("#platform-waiting-blurb").textContent = `${left.name} vs ${right.name}`;
    this.setPane("waiting");
    if (entrance === "p1-reveal" || local.spawnIndex === 0) {
      this.fighter?.revealOpponent(opponent);
    } else {
      await this.fighter?.enterAsPlayer2(local, opponent);
    }
  }

  showCountdown(seconds: number): void {
    const banner = required("#countdown-banner");
    const readout = required("#waiting-countdown");
    const label = seconds > 0 ? String(seconds) : "Fight!";
    banner.hidden = false;
    banner.textContent = label;
    readout.hidden = false;
    readout.textContent = label;
    required("#waiting-title").textContent = "Get ready";
    required("#platform-waiting-title").textContent = "Get ready";
    required("#platform-waiting-blurb").textContent = label;
    required("#waiting-solo").hidden = true;
    required("#waiting-versus").hidden = false;
  }

  showGame(): void {
    this.setSeeking(false);
    this.setMatchmakingMode(false);
    this.fighter?.clearRoster();
    required("#countdown-banner").hidden = true;
    this.setOverlay(false);
    this.hud.hidden = false;
  }

  showResult(title: string): void {
    this.setOverlay(true);
    this.resultTitle.textContent = title;
    this.setPane("result");
    this.hud.hidden = false;
  }

  setPreview(
    profile: UserProfile | null,
    items: InventoryItem[] = this.previewItems,
    guestSession = this.guestSession,
  ): void {
    this.profile = profile;
    this.previewItems = items;
    this.guestSession = Boolean(profile) && guestSession;
    this.fighter?.setAvatar(profile?.avatar ?? null);
    if (!profile) this.fighter?.playMove("idle");
    this.syncPreviewName();
    this.updatePlayerCard();
  }

  applyAvatar(avatar: AvatarConfiguration): void {
    if (!this.profile) return;
    this.profile = { ...this.profile, avatar: { ...avatar } };
    this.fighter?.setAvatar(avatar);
    this.setError(this.editError);
    if (this.pane === "edit") {
      this.renderLocker(
        this.profile,
        this.previewItems,
        this.lockerInventory,
        this.onEquipItem,
        this.onUnequipItem,
      );
    }
  }

  updateHud(state: GameState): void {
    if (this.hud.hidden) return;
    const players = [...(state.snapshot?.players ?? [])].sort(
      (a, b) => a.spawnIndex - b.spawnIndex,
    );
    const key = players
      .map((player) => `${player.id}:${player.name}:${player.lives}:${Math.round(player.damagePercent)}`)
      .join("|");
    if (key === this.hudKey) return;
    this.hudKey = key;

    for (const slot of this.hudSlots) {
      const player = players[slot.index];
      const { name, lives, percent } = slot;
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
      percent.setAttribute("style", `color:${slot.index === 0 ? "var(--p1)" : "var(--p2)"}`);
    }
  }

  onChooseGuest(handler: () => void): void {
    this.chooseGuestButton.addEventListener("click", handler);
  }

  onChooseLogin(handler: () => void): void {
    this.chooseLoginButton.addEventListener("click", handler);
  }

  onSignIn(handler: () => void): void {
    this.signInButton.addEventListener("click", handler);
  }

  onSignUp(handler: () => void): void {
    this.signUpButton.addEventListener("click", handler);
  }

  onBackToLanding(handler: () => void): void {
    required("#back-login", HTMLButtonElement).addEventListener("click", handler);
  }

  onBackFromEdit(handler: () => void): void {
    required("#back-edit", HTMLButtonElement).addEventListener("click", handler);
  }

  onJoin(handler: () => void): void {
    this.joinButton.addEventListener("click", handler);
  }

  onCancelWait(handler: () => void): void {
    this.cancelWaitButton.addEventListener("click", handler);
  }

  onAgain(handler: () => void): void {
    this.againButton.addEventListener("click", handler);
  }

  onSignOut(handler: () => void): void {
    this.signOutButton.addEventListener("click", handler);
  }

  onEditAvatar(handler: () => void): void {
    this.editButton.addEventListener("click", handler);
  }

  onSaveAvatar(handler: () => void): void {
    this.saveAvatarButton.addEventListener("click", handler);
  }

  rememberName(): void {
    const name = this.profile?.displayName || this.displayName();
    if (name && name !== "Fighter") localStorage.setItem("tituah:name", name);
  }

  async shatterFrom(target: HTMLElement): Promise<void> {
    await shatterElement(this.lobbyOptions, target);
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.lobbyOptions.classList.toggle("is-loading", loading);
    this.lobby.classList.toggle("is-loading", loading);
    this.editButton.disabled = loading;
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
      this.setVersusNames("—", "—", "empty", "empty");
    }
    requestAnimationFrame(() => this.fighter?.layout());
  }

  private setVersusNames(
    left: string,
    right: string,
    leftState: "empty" | "ready" | "waiting" | "pending",
    rightState: "empty" | "ready" | "waiting" | "pending",
  ): void {
    required("#versus-name-0").textContent = left;
    required("#versus-name-1").textContent = right;
    const card0 = required(".versus-card[data-slot='0']");
    const card1 = required(".versus-card[data-slot='1']");
    card0.dataset.state = leftState;
    card1.dataset.state = rightState;
  }

  private applyWaitingSlot(slot: 0 | 1): void {
    const chip = required("#waiting-slot");
    chip.dataset.slot = String(slot);
    chip.textContent = `Joining as Player ${slot + 1}`;
  }

  private applyWaitingSlotPending(): void {
    const chip = required("#waiting-slot");
    chip.removeAttribute("data-slot");
    chip.textContent = "Finding match…";
  }

  private setEditPreviewSlot(slot: 0 | 1, animate = false): void {
    // Stay on the edit screen — never leave a shattered options pane behind.
    this.lobbyOptions.classList.remove("is-shattering");
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preview-slot]")) {
      button.dataset.selected = String(Number(button.dataset.previewSlot) === slot);
    }
    if (!animate) {
      this.editPreviewToken += 1;
      this.fighter?.setSpawnPreview(slot);
      return;
    }
    // Slap first, then swap P1/P2 tint so the color change lands after the hit.
    const request = ++this.editPreviewToken;
    void (async () => {
      await this.fighter?.slapInPlace();
      if (request !== this.editPreviewToken) return;
      this.fighter?.setSpawnPreview(slot);
    })();
  }

  private async slapThen(target: HTMLElement, handler: () => void, shatter = true): Promise<void> {
    if (this.slapping) return;
    this.slapping = true;
    await this.playSlap(target, shatter);
    this.slapping = false;
    handler();
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
    if (reduced) return;
    if (this.fighter) {
      await this.fighter.slap(target, shatter ? () => shatterElement(this.lobbyOptions, target) : undefined);
      return;
    }
    target.classList.add("is-hit");
    if (shatter) await shatterElement(this.lobbyOptions, target);
    target.classList.remove("is-hit");
  }

  private setPane(pane: LobbyPane): void {
    this.pane = pane;
    for (const name of ["landing", "login", "menu", "waiting", "result", "edit"] as const) {
      required(`#pane-${name}`).hidden = name !== pane;
    }
    this.lobbyOptions.classList.remove("is-shattering");
    this.landingError.hidden = true;
    this.authError.hidden = true;
    this.menuError.hidden = true;
    this.editError.hidden = true;
    this.updatePlayerCard();
    requestAnimationFrame(() => this.fighter?.layout());
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
    required("#player-card-locked").hidden = !locked || waiting;
    required("#player-card-profile").hidden = locked || editing || waiting;
    required("#player-card-waiting").hidden = !waiting;
    required("#player-card-moves").hidden = locked || !editing || waiting;
    this.playerCard.classList.toggle("is-locked", locked && !waiting);
    this.playerCard.classList.toggle("is-moves", !locked && editing && !waiting);
    this.playerCard.classList.toggle("is-waiting", waiting);
    this.lobby.classList.toggle("is-signed-out", locked);
    if (!this.profile) {
      this.menuKind.textContent = "Ready";
      this.menuBlurb.textContent = "Your fighter is loaded. Find a match when you’re ready.";
      return;
    }
    this.playerStats.textContent = this.guestSession
      ? `Guest · Lv ${this.profile.progression.level} · ${this.profile.stats.wins}W ${this.profile.stats.losses}L`
      : `Lv ${this.profile.progression.level} · ${this.profile.stats.wins}W ${this.profile.stats.losses}L`;
    this.menuKind.textContent = this.guestSession ? "Guest" : "Account";
    this.menuBlurb.textContent = this.guestSession
      ? "You’re playing as a guest. Sign in later if you want this record on an account."
      : "Your name, stats, and cosmetics are saved to this account.";
  }

  private renderLocker(
    profile: UserProfile | null,
    items: InventoryItem[],
    inventory: UserInventoryItem[],
    onEquip: (itemId: string) => void,
    onUnequip: (slot: ItemSlot) => void,
  ): void {
    const owned = new Set(inventory.map((entry) => entry.itemId));
    const byId = new Map(items.map((item) => [item.id, item]));
    this.lockerGrid.replaceChildren();

    if (!profile) {
      this.editorHint.hidden = false;
      this.editorHint.textContent = "Play as guest or log in to edit and save your avatar.";
      return;
    }

    this.editorHint.hidden = true;
    this.editorHint.textContent = "";

    for (const itemId of owned) {
      const item = byId.get(itemId);
      if (!item) continue;
      const field = SLOT_TO_AVATAR_FIELD[item.slot];
      const equipped = profile.avatar[field] === item.id;
      const button = document.createElement("button");
      button.className = "item-card";
      button.type = "button";
      button.dataset.equipped = equipped ? "true" : "false";
      button.innerHTML = `<strong>${item.name}</strong><span>${item.slot} · ${item.rarity}</span>`;
      button.addEventListener("click", () => {
        if (equipped) {
          const slot = AVATAR_FIELD_TO_SLOT[field];
          if (slot) onUnequip(slot);
          return;
        }
        onEquip(item.id);
      });
      this.lockerGrid.append(button);
    }

    if (owned.size === 0) {
      this.editorHint.hidden = false;
      this.editorHint.textContent = "No cosmetics yet. Default items are granted on first login.";
    }
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

  private setError(node: HTMLElement, error?: string): void {
    node.hidden = !error;
    node.textContent = error ?? "";
  }

  private setOverlay(visible: boolean): void {
    this.overlay.dataset.hidden = visible ? "false" : "true";
    this.fighter?.setActive(visible);
  }
}

function isDemoMove(value: string): value is LobbyDemoMove {
  return DEMO_MOVES.has(value as LobbyDemoMove);
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
