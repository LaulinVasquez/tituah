import {
  AIR_ACCEL,
  AIR_FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_VELOCITY,
  MAX_JUMPS,
  MAX_FALL_SPEED,
  MOVE_SPEED,
} from "../data/physics.js";
import type { PlayerInput, PlayerState, Platform } from "../types.js";
import { resolveHorizontalCollisions, resolveVerticalCollisions } from "./collision.js";

export function applyMovement(
  player: PlayerState,
  input: PlayerInput,
  previousInput: PlayerInput,
  platforms: Platform[],
  dt: number,
): void {
  let previousBottom = player.position.y;
  const wish =
    (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (player.attackState.type === "combo") {
    player.velocity.x = MOVE_SPEED * player.facing * 0.88;
  } else if (wish !== 0) {
    player.facing = wish > 0 ? 1 : -1;
    const accel = player.grounded ? GROUND_ACCEL : AIR_ACCEL;
    player.velocity.x += wish * accel * dt;
    player.velocity.x = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.velocity.x));
  } else {
    const friction = player.grounded ? GROUND_FRICTION : AIR_FRICTION;
    const speed = Math.abs(player.velocity.x);
    const drop = friction * dt;
    player.velocity.x = speed <= drop ? 0 : player.velocity.x * ((speed - drop) / speed);
  }

  const jumpPressed = input.jump && !previousInput.jump;
  const dropPlatform = player.grounded && input.down
    ? platforms.find((platform) =>
        platform.id !== "main"
        && Math.abs(player.position.y - platform.y) <= 3
        && player.position.x >= platform.x
        && player.position.x <= platform.x + platform.width)
    : undefined;
  if (dropPlatform) {
    player.position.y = dropPlatform.y + 8;
    previousBottom = player.position.y;
    player.grounded = false;
  }
  if (player.grounded) {
    player.jumpsRemaining = MAX_JUMPS;
  }
  if (!dropPlatform && jumpPressed && player.jumpsRemaining > 0) {
    player.velocity.y = JUMP_VELOCITY;
    player.grounded = false;
    player.jumpsRemaining -= 1;
  }

  player.velocity.y = Math.min(player.velocity.y + GRAVITY * dt, MAX_FALL_SPEED);

  player.position.x += player.velocity.x * dt;
  resolveHorizontalCollisions(player, platforms);

  player.position.y += player.velocity.y * dt;
  resolveVerticalCollisions(player, platforms, previousBottom);
  if (player.grounded) {
    player.jumpsRemaining = MAX_JUMPS;
  }
}
