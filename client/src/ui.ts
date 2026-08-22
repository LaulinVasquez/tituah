import {
  AVATAR_FIELD_TO_SLOT,
  SLOT_TO_AVATAR_FIELD,
  type InventoryItem,
  type ItemSlot,
  type UserInventoryItem,
  type UserProfile,
} from "@tituah/shared";
import { applyAvatarLook } from "./character-preview.js";
import type { GameState } from "./game/game-state.js";

type LobbyPane = "landing" | "guest" | "login" | "menu" | "waiting" | "result";

const SLAP_MS = 520;

export class Ui {
  readonly overlay = required("#overlay");
  readonly hud = required("#hud");
  readonly characterColumn = required("#character-column");
  readonly fighterPreview = required("#fighter-preview");
  readonly previewName = required("#preview-name");
  readonly avatarEditor = required("#avatar-editor");
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
  readonly guestContinueButton = required("#guest-continue", HTMLButtonElement);
  readonly signInButton = required("#sign-in", HTMLButtonElement);
  readonly signUpButton = required("#sign-up", HTMLButtonElement);
  readonly joinButton = required("#join", HTMLButtonElement);
  readonly againButton = required("#again", HTMLButtonElement);
  readonly signOutButton = required("#sign-out", HTMLButtonElement);
  readonly profileLine = required("#profile-line");
  readonly guestError = required("#guest-error");
  readonly authError = required("#auth-error");
  readonly menuError = required("#menu-error");
  readonly resultTitle = required("#result-title");

  private pane: LobbyPane = "landing";
  private slapping = false;
  private previewItems: InventoryItem[] = [];
  private profile: UserProfile | null = null;

  get currentPane(): LobbyPane {
    return this.pane;
  }

  get editing(): boolean {
    return this.characterColumn.dataset.editing === "true";
  }

  constructor() {
    const stored = localStorage.getItem("tituah:name");
    if (stored) {
      this.displayNameInput.value = stored;
      this.loginNameInput.value = stored;
      this.setPreviewName(stored);
    }
    this.displayNameInput.addEventListener("input", () => this.syncPreviewName());
    this.loginNameInput.addEventListener("input", () => this.syncPreviewName());
    this.displayNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.guestContinueButton.click();
    });
    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.signInButton.click();
    });
    required("#lobby").addEventListener(
      "click",
      (event) => {
        const button = (event.target as HTMLElement | null)?.closest("button");
        if (!button || button.disabled) return;
        if (button.dataset.slapReplay === "true") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.slapping) return;
        void this.slapThen(button, () => {
          button.dataset.slapReplay = "true";
          button.click();
          delete button.dataset.slapReplay;
        });
      },
      true,
    );
  }

  displayName(source: "guest" | "login" | "any" = "any"): string {
    if (source === "guest") return this.displayNameInput.value.trim() || "Fighter";
    if (source === "login") return this.loginNameInput.value.trim() || "Fighter";
    return (
      this.displayNameInput.value.trim() ||
      this.loginNameInput.value.trim() ||
      this.profile?.displayName ||
      "Fighter"
    );
  }

  email(): string {
    return this.emailInput.value.trim();
  }

  password(): string {
    return this.passwordInput.value;
  }

  showAuth(error?: string): void {
    this.setOverlay(true);
    this.closeEditor();
    this.hud.hidden = true;
    if (error && (this.pane === "guest" || this.pane === "login")) {
      this.setPane(this.pane);
      this.setPaneError(error);
      return;
    }
    this.setPane("landing");
    this.setPaneError(error);
  }

  showGuest(error?: string): void {
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPane("guest");
    this.setPaneError(error);
    this.displayNameInput.focus();
  }

  showLogin(error?: string): void {
    this.setOverlay(true);
    this.hud.hidden = true;
    this.setPane("login");
    this.setPaneError(error);
    this.emailInput.focus();
  }

  showMenu(profile?: UserProfile | null, error?: string): void {
    this.setOverlay(true);
    this.closeEditor();
    this.hud.hidden = true;
    this.setPreview(profile ?? this.profile, this.previewItems);
    this.setPane("menu");
    if (profile) {
      this.profileLine.textContent = `${profile.displayName} · Lv ${profile.progression.level} · ${profile.stats.wins}W ${profile.stats.losses}L`;
    }
    this.setPaneError(error);
  }

  showLocker(
    profile: UserProfile | null,
    items: InventoryItem[],
    inventory: UserInventoryItem[],
    onEquip: (itemId: string) => void,
    onUnequip: (slot: ItemSlot) => void,
  ): void {
    this.setOverlay(true);
    this.characterColumn.dataset.editing = "true";
    this.avatarEditor.hidden = false;
    this.editButton.hidden = true;
    this.setPreview(profile, items);
    this.renderLocker(profile, items, inventory, onEquip, onUnequip);
  }

  closeEditor(): void {
    this.characterColumn.dataset.editing = "false";
    this.avatarEditor.hidden = true;
    this.editButton.hidden = this.pane === "waiting" || this.pane === "result";
    this.editorHint.hidden = true;
    this.editorHint.textContent = "";
  }

  showWaiting(): void {
    this.setOverlay(true);
    this.closeEditor();
    this.hud.hidden = true;
    this.setPane("waiting");
  }

  showGame(): void {
    this.setOverlay(false);
    this.closeEditor();
    this.hud.hidden = false;
  }

  showResult(title: string): void {
    this.setOverlay(true);
    this.closeEditor();
    this.resultTitle.textContent = title;
    this.setPane("result");
    this.hud.hidden = false;
  }

  setPreview(profile: UserProfile | null, items: InventoryItem[] = this.previewItems): void {
    this.profile = profile;
    this.previewItems = items;
    applyAvatarLook(this.fighterPreview, profile?.avatar ?? null, items);
    this.syncPreviewName();
  }

  updateHud(state: GameState): void {
    const players = [...(state.snapshot?.players ?? [])].sort(
      (a, b) => a.spawnIndex - b.spawnIndex,
    );
    for (const slot of this.hud.querySelectorAll<HTMLElement>(".fighter")) {
      const index = Number(slot.dataset.slot);
      const player = players[index];
      const name = slot.querySelector(".name");
      const lives = slot.querySelector(".lives");
      const percent = slot.querySelector(".percent");
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
      percent.setAttribute("style", `color:${index === 0 ? "var(--p1)" : "var(--p2)"}`);
    }
  }

  onChooseGuest(handler: () => void): void {
    this.chooseGuestButton.addEventListener("click", handler);
  }

  onChooseLogin(handler: () => void): void {
    this.chooseLoginButton.addEventListener("click", handler);
  }

  onGuestContinue(handler: () => void): void {
    this.guestContinueButton.addEventListener("click", handler);
  }

  onSignIn(handler: () => void): void {
    this.signInButton.addEventListener("click", handler);
  }

  onSignUp(handler: () => void): void {
    this.signUpButton.addEventListener("click", handler);
  }

  onBackToLanding(handler: () => void): void {
    required("#back-guest", HTMLButtonElement).addEventListener("click", handler);
    required("#back-login", HTMLButtonElement).addEventListener("click", handler);
  }

  onJoin(handler: () => void): void {
    this.joinButton.addEventListener("click", handler);
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
    const name = this.displayName();
    if (name && name !== "Fighter") localStorage.setItem("tituah:name", name);
    this.setPreviewName(name);
  }

  private async slapThen(target: HTMLElement, handler: () => void): Promise<void> {
    if (this.slapping) return;
    this.slapping = true;
    await this.playSlap(target);
    this.slapping = false;
    handler();
  }

  private playSlap(target: HTMLElement): Promise<void> {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return Promise.resolve();

    const body = this.fighterPreview.getBoundingClientRect();
    const hit = target.getBoundingClientRect();
    const originX = body.left + body.width * 0.82;
    const originY = body.top + body.height * 0.42;
    const destX = hit.left + hit.width / 2;
    const destY = hit.top + hit.height / 2;
    const dx = destX - originX;
    const dy = destY - originY;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const reach = Math.min(2.7, Math.max(1.15, Math.hypot(dx, dy) / (body.width * 0.38)));
    this.fighterPreview.style.setProperty("--slap-angle", `${angle}deg`);
    this.fighterPreview.style.setProperty("--slap-reach", String(reach));
    this.fighterPreview.classList.add("is-slapping");
    target.classList.add("is-hit");

    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.fighterPreview.classList.remove("is-slapping");
        target.classList.remove("is-hit");
        resolve();
      }, SLAP_MS);
    });
  }

  private setPane(pane: LobbyPane): void {
    this.pane = pane;
    for (const name of ["landing", "guest", "login", "menu", "waiting", "result"] as const) {
      required(`#pane-${name}`).hidden = name !== pane;
    }
    this.guestError.hidden = true;
    this.authError.hidden = true;
    this.menuError.hidden = true;
    if (!this.editing) {
      this.editButton.hidden = pane === "waiting" || pane === "result";
    }
  }

  private setPaneError(error?: string): void {
    const node =
      this.pane === "guest" ? this.guestError : this.pane === "login" ? this.authError : this.menuError;
    this.setError(node, this.pane === "landing" ? undefined : error);
    if (this.pane === "landing" && error) this.setError(this.authError, error);
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
    this.setPreviewName(this.profile?.displayName || this.displayName());
  }

  private setPreviewName(name: string): void {
    this.previewName.textContent = name || "Fighter";
  }

  private setError(node: HTMLElement, error?: string): void {
    node.hidden = !error;
    node.textContent = error ?? "";
  }

  private setOverlay(visible: boolean): void {
    this.overlay.dataset.hidden = visible ? "false" : "true";
  }
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
