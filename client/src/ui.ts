import type { GameState } from "./game/game-state.js";
import { isStageId, type StageId } from "@tituah/shared";

export class Ui {
  readonly overlay = document.querySelector("#overlay") as HTMLElement;
  readonly menu = document.querySelector("#menu") as HTMLElement;
  readonly waiting = document.querySelector("#waiting") as HTMLElement;
  readonly result = document.querySelector("#result") as HTMLElement;
  readonly resultTitle = document.querySelector("#result-title") as HTMLElement;
  readonly hud = document.querySelector("#hud") as HTMLElement;
  readonly nameInput = document.querySelector("#name") as HTMLInputElement;
  readonly joinButton = document.querySelector("#join") as HTMLButtonElement;
  readonly againButton = document.querySelector("#again") as HTMLButtonElement;
  readonly stageButtons = document.querySelectorAll<HTMLButtonElement>("[data-stage]");
  private selectedStage: StageId = "barnyard";

  constructor() {
    const stored = localStorage.getItem("tituah:name");
    if (stored) this.nameInput.value = stored;
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

  name(): string {
    return this.nameInput.value.trim() || "Fighter";
  }

  stageId(): StageId {
    return this.selectedStage;
  }

  showMenu(): void {
    this.setOverlay(true);
    this.menu.hidden = false;
    this.waiting.hidden = true;
    this.result.hidden = true;
    this.hud.hidden = true;
  }

  showWaiting(): void {
    this.setOverlay(true);
    this.menu.hidden = true;
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
    this.menu.hidden = true;
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

  onJoin(handler: () => void): void {
    this.joinButton.addEventListener("click", handler);
    this.nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handler();
    });
  }

  onAgain(handler: () => void): void {
    this.againButton.addEventListener("click", handler);
  }

  rememberName(): void {
    localStorage.setItem("tituah:name", this.name());
  }

  private setOverlay(visible: boolean): void {
    this.overlay.dataset.hidden = visible ? "false" : "true";
  }
}
