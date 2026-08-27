import { emptyInput, type PlayerInput } from "@tituah/shared";

export interface SampledInput {
  input: PlayerInput;
  attackEdge: "start" | "release" | null;
  throwEdge: boolean;
  runningFourSlapEdge: boolean;
  quickSlapPulse: boolean;
}

type VirtualAction = "left" | "right" | "down" | "up" | "jump" | "attack" | "throw";
type PointerBinding = { kind: "button"; action: VirtualAction } | { kind: "stick" };

const VIRTUAL_ACTIONS = new Set<VirtualAction>(["left", "right", "down", "up", "jump", "attack", "throw"]);
const STICK_MOVE = 0.28;
const STICK_JUMP = 0.38;
const STICK_DOWN = 0.42;
const DOUBLE_TAP_WINDOW_MS = 400;
const CHARGE_HOLD_MS = 220;

const EMPTY_EDGES: Omit<SampledInput, "input"> = {
  attackEdge: null,
  throwEdge: false,
  runningFourSlapEdge: false,
  quickSlapPulse: false,
};

export class InputManager {
  private sequence = 0;
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<VirtualAction>();
  private readonly pointers = new Map<number, PointerBinding>();
  private aimAngle = 0;
  private previousAttackHeld = false;
  private previousThrowHeld = false;
  private attackPressStartedAt = 0;
  private attackTapTimes: number[] = [];
  private latchedCombo: "running" | null = null;
  private chargeStarted = false;
  private latchedQuickSlap = false;
  private frameToken = 0;
  private lastFrameToken = -1;
  private edgesConsumed = false;

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

  /** Call once per visual frame before simulation steps. */
  beginFrame(frameToken: number): void {
    if (frameToken === this.lastFrameToken) return;
    this.lastFrameToken = frameToken;
    this.edgesConsumed = false;

    const now = performance.now();
    const attackHeld = this.isAttackHeld();
    this.attackTapTimes = this.attackTapTimes.filter((tap) => now - tap <= DOUBLE_TAP_WINDOW_MS);
    if (
      !attackHeld
      && this.attackTapTimes.length === 1
      && now - this.attackTapTimes[0] >= DOUBLE_TAP_WINDOW_MS
    ) {
      this.latchedQuickSlap = true;
      this.attackTapTimes = [];
    }
  }

  /** Returns edge flags once per frame (first simulation step only). */
  consumeEdges(): Omit<SampledInput, "input"> {
    if (this.edgesConsumed) return EMPTY_EDGES;
    this.edgesConsumed = true;

    const now = performance.now();
    const attackHeld = this.isAttackHeld();

    const runningFourSlapEdge = this.latchedCombo === "running";
    if (this.latchedCombo) {
      this.latchedCombo = null;
      this.chargeStarted = false;
      this.attackTapTimes = [];
    }

    const quickSlapPulse = this.latchedQuickSlap;
    this.latchedQuickSlap = false;

    let attackEdge: SampledInput["attackEdge"] = null;

    if (attackHeld && !this.previousAttackHeld) {
      this.attackPressStartedAt = now;
    }

    if (
      attackHeld
      && !this.chargeStarted
      && !runningFourSlapEdge
      && this.attackTapTimes.length === 0
      && now - this.attackPressStartedAt >= CHARGE_HOLD_MS
    ) {
      attackEdge = "start";
      this.chargeStarted = true;
    }

    if (!attackHeld && this.previousAttackHeld) {
      if (this.chargeStarted) {
        attackEdge = "release";
      }
      this.chargeStarted = false;
      this.attackPressStartedAt = 0;
    }

    this.previousAttackHeld = attackHeld;

    const throwHeld = this.virtual.has("throw") || this.keys.has("j");
    const throwEdge = throwHeld && !this.previousThrowHeld;
    this.previousThrowHeld = throwHeld;

    return {
      attackEdge,
      throwEdge,
      runningFourSlapEdge,
      quickSlapPulse,
    };
  }

  sampleMovement(): PlayerInput {
    return {
      sequence: ++this.sequence,
      left: this.keys.has("a") || this.keys.has("arrowleft") || this.virtual.has("left"),
      right: this.keys.has("d") || this.keys.has("arrowright") || this.virtual.has("right"),
      down: this.keys.has("s") || this.keys.has("arrowdown") || this.virtual.has("down"),
      jump:
        this.keys.has(" ")
        || this.keys.has("w")
        || this.keys.has("arrowup")
        || this.virtual.has("jump")
        || this.virtual.has("up"),
      attackHeld: this.isAttackHeld(),
      aimAngle: this.aimAngle,
      runningSlap: false,
    };
  }

  /** Convenience for single-step callers (lobby preview). */
  sample(): SampledInput {
    this.beginFrame(this.frameToken += 1);
    const edges = this.consumeEdges();
    const input = this.sampleMovement();
    input.runningSlap = edges.runningFourSlapEdge;
    return { input, ...edges };
  }

  peek(): PlayerInput {
    return {
      ...emptyInput(this.sequence),
      left: this.keys.has("a") || this.keys.has("arrowleft") || this.virtual.has("left"),
      right: this.keys.has("d") || this.keys.has("arrowright") || this.virtual.has("right"),
      down: this.keys.has("s") || this.keys.has("arrowdown") || this.virtual.has("down"),
      jump:
        this.keys.has(" ")
        || this.keys.has("w")
        || this.keys.has("arrowup")
        || this.virtual.has("jump")
        || this.virtual.has("up"),
      attackHeld: this.isAttackHeld(),
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

  private isAttackHeld(): boolean {
    return this.pointerDown || this.virtual.has("attack") || this.keys.has("h");
  }

  private registerAttackTap(now: number): void {
    this.attackTapTimes = this.attackTapTimes.filter((tap) => now - tap <= DOUBLE_TAP_WINDOW_MS);
    this.attackTapTimes.push(now);
    if (this.attackTapTimes.length >= 2) {
      if (this.isMovingHorizontally()) {
        this.latchedCombo = "running";
      }
      this.attackTapTimes = [];
      this.chargeStarted = false;
      this.latchedQuickSlap = false;
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") return;
    this.pointerDown = true;
    this.registerAttackTap(performance.now());
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
    if (action === "attack") {
      this.registerAttackTap(performance.now());
    }
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
    const key = event.key.toLowerCase();
    this.keys.add(key);
    if (key === "h" && !event.repeat) {
      this.registerAttackTap(performance.now());
    }
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
    this.previousThrowHeld = false;
    this.attackPressStartedAt = 0;
    this.attackTapTimes = [];
    this.latchedCombo = null;
    this.chargeStarted = false;
    this.latchedQuickSlap = false;
    this.edgesConsumed = false;
    this.lastFrameToken = -1;
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

  private isMovingHorizontally(): boolean {
    return (
      this.keys.has("a")
      || this.keys.has("d")
      || this.keys.has("arrowleft")
      || this.keys.has("arrowright")
      || this.virtual.has("left")
      || this.virtual.has("right")
      || Math.abs(this.stickX) >= STICK_MOVE
    );
  }
}

function actionOf(value: string | undefined): VirtualAction | null {
  return value && VIRTUAL_ACTIONS.has(value as VirtualAction) ? (value as VirtualAction) : null;
}
