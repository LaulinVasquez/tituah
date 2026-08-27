import { type PlayerState } from "@tituah/shared";
import { audio } from "./audio-manager.js";

const RUN_SPEED = 24;

interface TrackedPlayer {
  grounded: boolean;
  jumpsRemaining: number;
  attack: PlayerState["attackState"]["type"];
  throwAnim: boolean;
  velocityY: number;
  running: boolean;
}

export class SfxDirector {
  private previous: TrackedPlayer | null = null;

  reset(): void {
    this.previous = null;
    audio.stop("run");
    audio.stop("slapCharge");
  }

  observe(player: PlayerState): void {
    const next = snapshot(player);
    const prev = this.previous;
    this.previous = next;
    if (!prev) return;

    if (prev.grounded && !next.grounded) {
      audio.play(next.velocityY < -200 ? "jump" : "platformDrop");
    } else if (!prev.grounded && !next.grounded && next.jumpsRemaining < prev.jumpsRemaining) {
      audio.play("jumpAir");
    }

    if (!prev.grounded && next.grounded) audio.play("land");

    if (prev.attack !== "charging" && next.attack === "charging") audio.play("slapCharge");
    if (prev.attack === "charging" && next.attack !== "charging") audio.stop("slapCharge");
    if (prev.attack === "charging" && next.attack === "active") audio.play("slapSwing");

    if (!prev.throwAnim && next.throwAnim) audio.play("slapSwing");

    if (next.running) audio.playLoop("run");
    else audio.stop("run");
  }

  hit(charge: number): void {
    audio.play(charge >= 0.7 ? "slapHitHeavy" : "slapHitLight");
  }

  ko(): void {
    audio.play("ko");
  }

  respawn(): void {
    audio.play("ko");
    window.setTimeout(() => audio.play("respawn"), 420);
  }

  countdown(seconds: number): void {
    audio.play(seconds > 0 ? "countdown" : "fight");
  }

  fight(): void {
    audio.play("fight");
  }
}

function snapshot(player: PlayerState): TrackedPlayer {
  return {
    grounded: player.grounded,
    jumpsRemaining: player.jumpsRemaining,
    attack: player.attackState.type,
    throwAnim: (player.throwAnimUntil ?? 0) > 0,
    velocityY: player.velocity.y,
    running: player.grounded && Math.abs(player.velocity.x) >= RUN_SPEED,
  };
}

export const sfx = new SfxDirector();
