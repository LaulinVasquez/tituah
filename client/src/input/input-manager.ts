import { emptyInput, type PlayerInput } from "@tituah/shared";

export interface SampledInput {
  input: PlayerInput;
  attackEdge: "start" | "release" | null;
}

type VirtualAction = "left" | "right" | "down" | "up" | "jump" | "attack";
type PointerBinding = { kind: "button"; action: VirtualAction } | { kind: "stick" };

const VIRTUAL_ACTIONS = new Set<VirtualAction>(["left", "right", "down", "up", "jump", "attack"]);
const STICK_MOVE = 0.28;
const STICK_JUMP = 0.38;
const STICK_DOWN = 0.42;

export class InputManager {
  private sequence = 0;
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<VirtualAction>();
  private readonly pointers = new Map<number, PointerBinding>();
  private aimAngle = 0;
  private previousAttackHeld = false;

  private pointerDown = false;
  private stickX = 0;
  private stickY = 0;
  private readonly touchButtons: HTMLButtonElement[];
  private readonly stickEl: HTMLElement | null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    if (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches) {
      document.documentElement.classList.add("has-touch");
    }
    this.touchButtons = [...document.querySelectorAll<HTMLButtonElement>("#touch-controls [data-action]")];
    this.stickEl = document.getElementById("touch-stick");
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("pointermove", this.onWindowPointerMove);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointermove", this.onPointerMove);
    for (const button of this.touchButtons) {
      button.addEventListener("pointerdown", this.onTouchDown);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }
    if (this.stickEl) {
      this.stickEl.addEventListener("pointerdown", this.onStickDown);
      this.stickEl.addEventListener("contextmenu", (event) => event.preventDefault());
    }
  }

  sample(): SampledInput {
    const attackHeld =
      this.pointerDown ||
      this.virtual.has("attack") ||
      this.keys.has("z") ||
      this.keys.has("j") ||
      this.keys.has("k");
    let attackEdge: SampledInput["attackEdge"] = null;
    if (attackHeld && !this.previousAttackHeld) attackEdge = "start";
    if (!attackHeld && this.previousAttackHeld) attackEdge = "release";
    this.previousAttackHeld = attackHeld;

    return {
      input: {
        sequence: ++this.sequence,
        left: this.keys.has("a") || this.keys.has("arrowleft") || this.virtual.has("left"),
        right: this.keys.has("d") || this.keys.has("arrowright") || this.virtual.has("right"),
        down: this.keys.has("s") || this.keys.has("arrowdown") || this.virtual.has("down"),
        jump:
          this.keys.has(" ") ||
          this.keys.has("w") ||
          this.keys.has("arrowup") ||
          this.virtual.has("jump") ||
          this.virtual.has("up"),
        attackHeld,
        aimAngle: this.aimAngle,
      },
      attackEdge,
    };
  }

  peek(): PlayerInput {
    return {
      ...emptyInput(this.sequence),
      left: this.keys.has("a") || this.keys.has("arrowleft") || this.virtual.has("left"),
      right: this.keys.has("d") || this.keys.has("arrowright") || this.virtual.has("right"),
      down: this.keys.has("s") || this.keys.has("arrowdown") || this.virtual.has("down"),
      jump:
        this.keys.has(" ") ||
        this.keys.has("w") ||
        this.keys.has("arrowup") ||
        this.virtual.has("jump") ||
        this.virtual.has("up"),
      attackHeld:
        this.pointerDown ||
        this.virtual.has("attack") ||
        this.keys.has("z") ||
        this.keys.has("j") ||
        this.keys.has("k"),
      aimAngle: this.aimAngle,
    };
  }

  reset(): void {
    this.clear();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    for (const button of this.touchButtons) {
      button.removeEventListener("pointerdown", this.onTouchDown);
    }
    this.stickEl?.removeEventListener("pointerdown", this.onStickDown);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") return;
    this.pointerDown = true;
    this.updateAim(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const binding = this.pointers.get(event.pointerId);
    if (binding) {
      this.pointers.delete(event.pointerId);
      if (binding.kind === "stick") this.resetStick();
      this.syncVirtual();
    }
    if (event.pointerType === "touch") return;
    this.pointerDown = false;
  };

  private readonly onTouchDown = (event: PointerEvent): void => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    const action = actionOf(button.dataset.action);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.pointers.set(event.pointerId, { kind: "button", action });
    this.syncVirtual();
  };

  private readonly onStickDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    for (const binding of this.pointers.values()) {
      if (binding.kind === "stick") return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.stickEl?.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { kind: "stick" });
    this.stickEl?.classList.add("is-active");
    this.updateStick(event);
  };

  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    if (this.pointers.get(event.pointerId)?.kind !== "stick") return;
    this.updateStick(event);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.key.toLowerCase());
    if (event.key === " " || event.key.startsWith("Arrow")) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updateAim(event);
  };

  private readonly clear = (): void => {
    this.keys.clear();
    this.virtual.clear();
    this.pointers.clear();
    this.pointerDown = false;
    this.previousAttackHeld = false;
    this.resetStick();
    this.syncPressed();
  };

  private updateStick(event: PointerEvent): void {
    if (!this.stickEl) return;
    const rect = this.stickEl.getBoundingClientRect();
    const max = Math.min(rect.width, rect.height) * 0.32;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > max && dist > 0) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.stickX = max > 0 ? dx / max : 0;
    this.stickY = max > 0 ? dy / max : 0;
    this.stickEl.style.setProperty("--stick-x", `${dx}px`);
    this.stickEl.style.setProperty("--stick-y", `${dy}px`);
    this.syncVirtual();
  }

  private resetStick(): void {
    this.stickX = 0;
    this.stickY = 0;
    this.stickEl?.classList.remove("is-active");
    this.stickEl?.style.setProperty("--stick-x", "0px");
    this.stickEl?.style.setProperty("--stick-y", "0px");
  }

  private syncVirtual(): void {
    this.virtual.clear();
    for (const binding of this.pointers.values()) {
      if (binding.kind === "button") this.virtual.add(binding.action);
    }
    if (this.stickX <= -STICK_MOVE) this.virtual.add("left");
    if (this.stickX >= STICK_MOVE) this.virtual.add("right");
    if (this.stickY <= -STICK_JUMP) this.virtual.add("up");
    if (this.stickY >= STICK_DOWN) this.virtual.add("down");
    this.syncPressed();
  }

  private syncPressed(): void {
    for (const button of this.touchButtons) {
      const action = actionOf(button.dataset.action);
      const pressed =
        Boolean(action && this.virtual.has(action)) ||
        (action === "jump" && this.virtual.has("up"));
      button.classList.toggle("is-pressed", pressed);
    }
  }

  private updateAim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    this.aimAngle = Math.atan2(y - this.canvas.height / 2, x - this.canvas.width / 2);
  }
}

function actionOf(value: string | undefined): VirtualAction | null {
  return value && VIRTUAL_ACTIONS.has(value as VirtualAction) ? (value as VirtualAction) : null;
}
