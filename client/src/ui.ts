import {
  AVATAR_FIELD_TO_SLOT,
  SLOT_TO_AVATAR_FIELD,
  type InventoryItem,
  type ItemSlot,
  type UserInventoryItem,
  type UserProfile,
} from "@tituah/shared";
import type { GameState } from "./game/game-state.js";
import { isStageId, type StageId } from "@tituah/shared";

export class Ui {
  readonly overlay = document.querySelector("#overlay") as HTMLElement;
  readonly auth = document.querySelector("#auth") as HTMLElement;
  readonly menu = document.querySelector("#menu") as HTMLElement;
  readonly locker = document.querySelector("#locker") as HTMLElement;
  readonly waiting = document.querySelector("#waiting") as HTMLElement;
  readonly result = document.querySelector("#result") as HTMLElement;
  readonly resultTitle = document.querySelector("#result-title") as HTMLElement;
  readonly hud = document.querySelector("#hud") as HTMLElement;
  readonly displayNameInput = document.querySelector("#display-name") as HTMLInputElement;
  readonly emailInput = document.querySelector("#email") as HTMLInputElement;
  readonly passwordInput = document.querySelector("#password") as HTMLInputElement;
  readonly signInButton = document.querySelector("#sign-in") as HTMLButtonElement;
  readonly signUpButton = document.querySelector("#sign-up") as HTMLButtonElement;
  readonly guestButton = document.querySelector("#guest") as HTMLButtonElement;
  readonly joinButton = document.querySelector("#join") as HTMLButtonElement;
  readonly againButton = document.querySelector("#again") as HTMLButtonElement;
  readonly stageButtons = document.querySelectorAll<HTMLButtonElement>("[data-stage]");
  private selectedStage: StageId = "barnyard";
  readonly signOutButton = document.querySelector("#sign-out") as HTMLButtonElement;
  readonly openLockerButton = document.querySelector("#open-locker") as HTMLButtonElement;
  readonly closeLockerButton = document.querySelector("#close-locker") as HTMLButtonElement;
  readonly profileLine = document.querySelector("#profile-line") as HTMLElement;
  readonly lockerGrid = document.querySelector("#locker-grid") as HTMLElement;
  readonly authError = document.querySelector("#auth-error") as HTMLElement;
  readonly menuError = document.querySelector("#menu-error") as HTMLElement;

  constructor() {
    const stored = localStorage.getItem("tituah:name");
    if (stored) this.displayNameInput.value = stored;
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
  }

  displayName(): string {
    return this.displayNameInput.value.trim() || "Fighter";
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
    this.auth.hidden = false;
    this.menu.hidden = true;
    this.locker.hidden = true;
    this.waiting.hidden = true;
    this.result.hidden = true;
    this.hud.hidden = true;
    this.setError(this.authError, error);
  }

  showMenu(profile?: UserProfile | null, error?: string): void {
    this.setOverlay(true);
    this.auth.hidden = true;
    this.menu.hidden = false;
    this.locker.hidden = true;
    this.waiting.hidden = true;
    this.result.hidden = true;
    this.hud.hidden = true;
    if (profile) {
      this.profileLine.textContent = `${profile.displayName} · Lv ${profile.progression.level} · ${profile.stats.wins}W ${profile.stats.losses}L`;
    }
    this.setError(this.menuError, error);
  }

  showLocker(
    profile: UserProfile,
    items: InventoryItem[],
    inventory: UserInventoryItem[],
    onEquip: (itemId: string) => void,
    onUnequip: (slot: ItemSlot) => void,
  ): void {
    this.setOverlay(true);
    this.auth.hidden = true;
    this.menu.hidden = true;
    this.locker.hidden = false;
    this.waiting.hidden = true;
    this.result.hidden = true;
    this.renderLocker(profile, items, inventory, onEquip, onUnequip);
  }

  showWaiting(): void {
    this.setOverlay(true);
    this.auth.hidden = true;
    this.menu.hidden = true;
    this.locker.hidden = true;
    this.waiting.hidden = false;
    this.result.hidden = true;
    this.hud.hidden = true;
  }

  showGame(): void {
    this.setOverlay(false);
    this.hud.hidden = false;
  }

  showResult(title: string): void {
    this.setOverlay(true);
    this.auth.hidden = true;
    this.menu.hidden = true;
    this.locker.hidden = true;
    this.waiting.hidden = true;
    this.result.hidden = false;
    this.resultTitle.textContent = title;
    this.hud.hidden = false;
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

  onSignIn(handler: () => void): void {
    this.signInButton.addEventListener("click", handler);
  }

  onSignUp(handler: () => void): void {
    this.signUpButton.addEventListener("click", handler);
  }

  onGuest(handler: () => void): void {
    this.guestButton.addEventListener("click", handler);
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

  onOpenLocker(handler: () => void): void {
    this.openLockerButton.addEventListener("click", handler);
  }

  onCloseLocker(handler: () => void): void {
    this.closeLockerButton.addEventListener("click", handler);
  }

  rememberName(): void {
    localStorage.setItem("tituah:name", this.displayName());
  }

  private renderLocker(
    profile: UserProfile,
    items: InventoryItem[],
    inventory: UserInventoryItem[],
    onEquip: (itemId: string) => void,
    onUnequip: (slot: ItemSlot) => void,
  ): void {
    const owned = new Set(inventory.map((entry) => entry.itemId));
    const byId = new Map(items.map((item) => [item.id, item]));
    this.lockerGrid.replaceChildren();

    for (const itemId of owned) {
      const item = byId.get(itemId);
      if (!item) continue;
      const field = SLOT_TO_AVATAR_FIELD[item.slot];
      const equipped = profile.avatar[field] === item.id;
      const button = document.createElement("button");
      button.className = "item-card";
      button.type = "button";
      button.dataset.equipped = equipped ? "true" : "false";
      button.innerHTML = `<strong>${item.name}</strong><span>${item.slot} · ${item.rarity}</span><span>${item.assetId}</span>`;
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
      const empty = document.createElement("p");
      empty.className = "blurb";
      empty.textContent = "No cosmetics yet. Default items are granted on first login.";
      this.lockerGrid.append(empty);
    }
  }

  private setError(node: HTMLElement, error?: string): void {
    node.hidden = !error;
    node.textContent = error ?? "";
  }

  private setOverlay(visible: boolean): void {
    this.overlay.dataset.hidden = visible ? "false" : "true";
  }
}
