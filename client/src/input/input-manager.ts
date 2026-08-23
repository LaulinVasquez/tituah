import { emptyInput, type PlayerInput } from "@tituah/shared";

export interface SampledInput {
  input: PlayerInput;
  attackEdge: "start" | "release" | null;
}

export class InputManager {
  private sequence = 0;
  private readonly keys = new Set<string>();
  private aimAngle = 0;
  private previousAttackHeld = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointermove", this.onPointerMove);
  }

  sample(): SampledInput {
    const attackHeld = this.keys.has("z");
    let attackEdge: SampledInput["attackEdge"] = null;
    if (attackHeld && !this.previousAttackHeld) attackEdge = "start";
    if (!attackHeld && this.previousAttackHeld) attackEdge = "release";
    this.previousAttackHeld = attackHeld;

    return {
      input: {
        sequence: ++this.sequence,
        left: this.keys.has("a") || this.keys.has("arrowleft"),
        right: this.keys.has("d") || this.keys.has("arrowright"),
        down: this.keys.has("s") || this.keys.has("arrowdown"),
        jump: this.keys.has(" ") || this.keys.has("w") || this.keys.has("arrowup"),
        attackHeld,
        aimAngle: this.aimAngle,
      },
      attackEdge,
    };
  }

  peek(): PlayerInput {
    return {
      ...emptyInput(this.sequence),
      left: this.keys.has("a") || this.keys.has("arrowleft"),
      right: this.keys.has("d") || this.keys.has("arrowright"),
      down: this.keys.has("s") || this.keys.has("arrowdown"),
      jump: this.keys.has(" ") || this.keys.has("w") || this.keys.has("arrowup"),
      attackHeld: this.keys.has("z"),
      aimAngle: this.aimAngle,
    };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
  }

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
    this.previousAttackHeld = false;
  };

  private updateAim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    this.aimAngle = Math.atan2(y - this.canvas.height / 2, x - this.canvas.width / 2);
  }
}
