import { isThrowCharging, type PlayerState } from "@tituah/shared";
import { audio } from "./audio-manager.js";

const RUN_SPEED = 24;

interface TrackedPlayer {
  grounded: boolean;
  jumpsRemaining: number;
  attack: PlayerState["attackState"]["type"];
  throwCharging: boolean;
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

  observe(player: PlayerState, time = 0): void {
    const next = snapshot(player, time);
    const prev = this.previous;
    this.previous = next;
    if (!prev) return;

    if (prev.grounded && !next.grounded) {
      audio.play(next.velocityY < -200 ? "jump" : "platformDrop");
    } else if (!prev.grounded && !next.grounded && next.jumpsRemaining < prev.jumpsRemaining) {
      audio.play("jumpAir");
    }

    if (!prev.grounded && next.grounded) audio.play("land");

    const slapChargeStarted = prev.attack !== "charging" && next.attack === "charging";
    const throwChargeStarted = !prev.throwCharging && next.throwCharging;
    const slapChargeEnded = prev.attack === "charging" && next.attack !== "charging";
    const throwChargeEnded = prev.throwCharging && !next.throwCharging;

    // One-shot charge cue shared by slap + throw — never stack/restart while already playing.
    if ((slapChargeStarted || throwChargeStarted) && !audio.isPlaying("slapCharge")) {
      audio.play("slapCharge");
    }
    if ((slapChargeEnded || throwChargeEnded) && !next.throwCharging && next.attack !== "charging") {
      audio.stop("slapCharge");
    }

    if (prev.attack === "charging" && next.attack === "active") audio.play("slapSwing");
    // Edge only: throwAnim was previously level-checked, so after the first throw
    // (throwAnimUntil > 0 forever) every charge frame re-fired slapSwing.
    if (!prev.throwAnim && next.throwAnim) audio.play("slapSwing");

    if (next.running) audio.playLoop("run");
    else if (prev.running) audio.stop("run");
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

function snapshot(player: PlayerState, time: number): TrackedPlayer {
  return {
    grounded: player.grounded,
    jumpsRemaining: player.jumpsRemaining,
    attack: player.attackState.type,
    throwCharging: isThrowCharging(player),
    throwAnim: (player.throwAnimUntil ?? 0) > time,
    velocityY: player.velocity.y,
    running: player.grounded && Math.abs(player.velocity.x) >= RUN_SPEED,
  };
}

export const sfx = new SfxDirector();
