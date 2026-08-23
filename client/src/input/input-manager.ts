import { emptyInput, type PlayerInput } from "@tituah/shared";

export interface SampledInput {
  input: PlayerInput;
  attackEdge: "start" | "release" | null;
}

type VirtualAction = "left" | "right" | "down" | "up" | "jump" | "attack";

const VIRTUAL_ACTIONS = new Set<VirtualAction>(["left", "right", "down", "up", "jump", "attack"]);

export class InputManager {
  private sequence = 0;
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<VirtualAction>();
  private readonly pointers = new Map<number, VirtualAction>();
  private aimAngle = 0;
  private previousAttackHeld = false;

  private pointerDown = false;
  private readonly touchButtons: HTMLButtonElement[];

  constructor(private readonly canvas: HTMLCanvasElement) {
    if (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches) {
      document.documentElement.classList.add("has-touch");
    }
    this.touchButtons = [...document.querySelectorAll<HTMLButtonElement>("#touch-controls [data-action]")];
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointermove", this.onPointerMove);
    for (const button of this.touchButtons) {
      button.addEventListener("pointerdown", this.onTouchDown);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
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

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    for (const button of this.touchButtons) {
      button.removeEventListener("pointerdown", this.onTouchDown);
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") return;
    this.pointerDown = true;
    this.updateAim(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.delete(event.pointerId);
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
    this.pointers.set(event.pointerId, action);
    this.syncVirtual();
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
    this.syncPressed();
  };

  private syncVirtual(): void {
    this.virtual.clear();
    for (const action of this.pointers.values()) this.virtual.add(action);
    this.syncPressed();
  }

  private syncPressed(): void {
    for (const button of this.touchButtons) {
      const action = actionOf(button.dataset.action);
      button.classList.toggle("is-pressed", Boolean(action && this.virtual.has(action)));
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
