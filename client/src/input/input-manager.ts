import { emptyInput, type PlayerInput } from "@tituah/shared";

export interface SampledInput {
  input: PlayerInput;
  /** True when charge should begin this frame (may pair with attackRelease for a tap). */
  attackStart: boolean;
  /** True when charge should release into a hit this frame. */
  attackRelease: boolean;
  /** True when throw charge should begin (may pair with throwRelease for a tap). */
  throwStart: boolean;
  /** True when throw charge should release into a throw. */
  throwRelease: boolean;
  runningFourSlapEdge: boolean;
}

type VirtualAction = "left" | "right" | "down" | "up" | "jump" | "attack" | "throw";
type PointerBinding = { kind: "button"; action: VirtualAction } | { kind: "stick" };

const VIRTUAL_ACTIONS = new Set<VirtualAction>(["left", "right", "down", "up", "jump", "attack", "throw"]);
const STICK_MOVE = 0.28;
const STICK_JUMP = 0.38;
const STICK_DOWN = 0.42;
const DOUBLE_TAP_WINDOW_MS = 400;

const EMPTY_EDGES: Omit<SampledInput, "input"> = {
  attackStart: false,
  attackRelease: false,
  throwStart: false,
  throwRelease: false,
  runningFourSlapEdge: false,
};

export class InputManager {
  private sequence = 0;
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<VirtualAction>();
  private readonly pointers = new Map<number, PointerBinding>();
  private aimAngle = 0;
  private previousAttackHeld = false;
  private previousThrowHeld = false;
  private throwPressStartedAt = 0;
  private throwChargeStarted = false;
  /** Press+release finished before any sim frame saw the hold — fire start+release together. */
  private pendingThrowFire = false;
  private attackPressStartedAt = 0;
  private attackTapTimes: number[] = [];
  private latchedCombo: "running" | null = null;
  /** Charge was started via consumeEdges (or pending tap) and not yet released. */
  private chargeStarted = false;
  /** Press+release finished before any sim frame saw the hold — fire start+release together. */
  private pendingTapFire = false;
  /** Suppress attackHeld for the combo frame so syncAttackFromInput does not re-start a slap. */
  private suppressAttackHeld = false;
  /** After a normal slap release while moving; second tap can still upgrade to run-slap. */
  private lastReleaseAt = 0;
  private lastReleaseWasMoving = false;
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
    this.suppressAttackHeld = false;

    const now = performance.now();
    this.attackTapTimes = this.attackTapTimes.filter((tap) => now - tap <= DOUBLE_TAP_WINDOW_MS);
    if (this.lastReleaseAt > 0 && now - this.lastReleaseAt > DOUBLE_TAP_WINDOW_MS) {
      this.lastReleaseAt = 0;
      this.lastReleaseWasMoving = false;
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
      this.pendingTapFire = false;
      this.attackTapTimes = [];
      this.lastReleaseAt = 0;
      this.lastReleaseWasMoving = false;
      this.suppressAttackHeld = true;
      this.attackPressStartedAt = 0;
    }

    let attackStart = false;
    let attackRelease = false;

    if (runningFourSlapEdge) {
      this.previousAttackHeld = attackHeld;
    } else if (this.pendingTapFire) {
      // Sub-frame tap: charge starts and releases in one pulse (minimal charge hit).
      this.pendingTapFire = false;
      attackStart = true;
      attackRelease = true;
      this.chargeStarted = false;
      this.attackPressStartedAt = 0;
      this.lastReleaseAt = now;
      this.lastReleaseWasMoving = this.isMovingHorizontally();
      this.previousAttackHeld = attackHeld;
    } else {
      if (attackHeld && !this.previousAttackHeld) {
        if (this.attackPressStartedAt <= 0) this.attackPressStartedAt = now;
        attackStart = true;
        this.chargeStarted = true;
      }

      if (!attackHeld && this.previousAttackHeld) {
        if (this.chargeStarted) {
          attackRelease = true;
          this.lastReleaseAt = now;
          this.lastReleaseWasMoving = this.isMovingHorizontally();
        }
        this.chargeStarted = false;
        this.attackPressStartedAt = 0;
      }

      this.previousAttackHeld = attackHeld;
    }

    const throwHeld = this.isThrowHeld();
    let throwStart = false;
    let throwRelease = false;

    if (this.pendingThrowFire) {
      this.pendingThrowFire = false;
      throwStart = true;
      throwRelease = true;
      this.throwChargeStarted = false;
      this.throwPressStartedAt = 0;
      this.previousThrowHeld = throwHeld;
    } else {
      if (throwHeld && !this.previousThrowHeld) {
        if (this.throwPressStartedAt <= 0) this.throwPressStartedAt = now;
        throwStart = true;
        this.throwChargeStarted = true;
      }
      if (!throwHeld && this.previousThrowHeld) {
        if (this.throwChargeStarted) throwRelease = true;
        this.throwChargeStarted = false;
        this.throwPressStartedAt = 0;
      }
      this.previousThrowHeld = throwHeld;
    }

    return {
      attackStart,
      attackRelease,
      throwStart,
      throwRelease,
      runningFourSlapEdge,
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
      // Report held immediately so charge begins on press (tap = short charge + release).
      attackHeld: this.isAttackHeld() && !this.suppressAttackHeld,
      throwHeld: this.isThrowHeld(),
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
      attackHeld: this.isAttackHeld() && !this.suppressAttackHeld,
      throwHeld: this.isThrowHeld(),
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

  private isThrowHeld(): boolean {
    return this.virtual.has("throw") || this.keys.has("j");
  }

  private noteThrowPressed(now: number): void {
    if (!this.isThrowHeld()) {
      this.throwPressStartedAt = now;
    }
  }

  private noteThrowReleased(_now: number): void {
    if (this.isThrowHeld()) return;
    if (!this.throwChargeStarted && !this.previousThrowHeld) {
      if (this.throwPressStartedAt > 0) {
        this.pendingThrowFire = true;
      }
    }
    if (!this.throwChargeStarted) {
      this.throwPressStartedAt = 0;
    }
  }

  private registerAttackTap(now: number): void {
    this.attackTapTimes = this.attackTapTimes.filter((tap) => now - tap <= DOUBLE_TAP_WINDOW_MS);
    this.attackTapTimes.push(now);
    const recentMovingRelease =
      this.lastReleaseWasMoving
      && this.lastReleaseAt > 0
      && now - this.lastReleaseAt <= DOUBLE_TAP_WINDOW_MS;
    // Two taps, or a second tap right after a released slap while still moving.
    if (
      this.attackTapTimes.length >= 2
      || (recentMovingRelease && this.isMovingHorizontally())
    ) {
      if (this.isMovingHorizontally()) {
        this.latchedCombo = "running";
        this.suppressAttackHeld = true;
      }
      this.attackTapTimes = [];
      this.chargeStarted = false;
      this.pendingTapFire = false;
      this.lastReleaseAt = 0;
      this.lastReleaseWasMoving = false;
    }
  }

  /** Call before the attack source is added to held state. */
  private noteAttackPressed(now: number): void {
    if (!this.isAttackHeld()) {
      this.attackPressStartedAt = now;
    }
    this.registerAttackTap(now);
  }

  /** Call after the attack source is removed from held state. */
  private noteAttackReleased(_now: number): void {
    if (this.isAttackHeld()) return;
    // Press and release finished before consumeEdges ever saw a hold.
    if (!this.chargeStarted && !this.previousAttackHeld && !this.latchedCombo) {
      if (this.attackPressStartedAt > 0) {
        this.pendingTapFire = true;
      }
    }
    if (!this.chargeStarted) {
      this.attackPressStartedAt = 0;
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") return;
    this.noteAttackPressed(performance.now());
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
    if (event.pointerType === "touch") {
      this.noteAttackReleased(performance.now());
      this.noteThrowReleased(performance.now());
      return;
    }
    this.pointerDown = false;
    this.noteAttackReleased(performance.now());
  };

  private readonly onTouchDown = (event: PointerEvent): void => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    const action = actionOf(button.dataset.action);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "attack") {
      this.noteAttackPressed(performance.now());
    } else if (action === "throw") {
      this.noteThrowPressed(performance.now());
    }
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
    const key = event.key.toLowerCase();
    if (key === "h" && !event.repeat) {
      this.noteAttackPressed(performance.now());
    }
    if (key === "j" && !event.repeat) {
      this.noteThrowPressed(performance.now());
    }
    this.keys.add(key);
    if (event.key === " " || event.key.startsWith("Arrow")) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    if (key === "h") {
      this.noteAttackReleased(performance.now());
    }
    if (key === "j") {
      this.noteThrowReleased(performance.now());
    }
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
    this.throwPressStartedAt = 0;
    this.throwChargeStarted = false;
    this.pendingThrowFire = false;
    this.attackPressStartedAt = 0;
    this.attackTapTimes = [];
    this.latchedCombo = null;
    this.chargeStarted = false;
    this.pendingTapFire = false;
    this.suppressAttackHeld = false;
    this.lastReleaseAt = 0;
    this.lastReleaseWasMoving = false;
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
