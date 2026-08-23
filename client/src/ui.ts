import {
  AVATAR_FIELD_TO_SLOT,
  isStageId,
  SLOT_TO_AVATAR_FIELD,
  type InventoryItem,
  type ItemSlot,
  type StageId,
  type UserInventoryItem,
  type UserProfile,
} from "@tituah/shared";
import type { GameState } from "./game/game-state.js";
import {
  LobbyFighterPreview,
  type LobbyDemoMove,
} from "./rendering/lobby-fighter-preview.js";
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
  private guestSession = false;
  private previewItems: InventoryItem[] = [];
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
        this.selectedStage = id;
        for (const entry of this.stageButtons) {
          entry.dataset.selected = String(entry === button);
        }
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
    required("#lobby").addEventListener(
      "click",
      (event) => {
        const button = (event.target as HTMLElement | null)?.closest("button");
        if (!button || button.disabled || this.loading) return;
        if (button.dataset.slapReplay === "true") return;
        if (button.classList.contains("item-card")) return;
        if (button.dataset.stage) return;
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

  email(): string {
    return this.emailInput.value.trim();
  }

  password(): string {
    return this.passwordInput.value;
  }

  showAuth(error?: string): void {
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
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPane("login");
    this.setPaneError(error);
    this.emailInput.focus();
  }

  showMenu(profile?: UserProfile | null, error?: string, guestSession = this.guestSession): void {
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
    this.setOverlay(true);
    if (this.pane !== "edit") this.paneBeforeEdit = this.pane;
    this.setPreview(profile, items, this.guestSession);
    this.displayNameInput.value = profile?.displayName ?? "";
    this.setPane("edit");
    this.renderLocker(profile, items, inventory, onEquip, onUnequip);
    this.setError(this.editError, error);
    this.setActiveMove("idle");
    this.displayNameInput.focus();
  }

  closeEditor(): void {
    this.fighter?.playMove("idle");
    this.setActiveMove("idle");
    const previous = this.paneBeforeEdit;
    if (previous === "menu") this.showMenu(this.profile);
    else if (previous === "login") this.showLogin();
    else this.showAuth();
  }

  showWaiting(): void {
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPane("waiting");
  }

  showGame(): void {
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
    required("#player-card-locked").hidden = !locked;
    required("#player-card-profile").hidden = locked || editing;
    required("#player-card-moves").hidden = locked || !editing;
    this.playerCard.classList.toggle("is-locked", locked);
    this.playerCard.classList.toggle("is-moves", !locked && editing);
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
