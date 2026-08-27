import { PLAYER_HEIGHT } from "../data/physics.js";
import { FLIPFLOP_THROW_ID, getAttack } from "../data/attacks.js";
import { lerp } from "../math.js";
import { throwableIdFromAvatar } from "../sprites/ids.js";
import type { PlayerInput, PlayerState, Projectile } from "../types.js";
import { cancelAttackCharge, getCharge } from "./combat.js";
import { createProjectile, playerHasActiveFlipflop } from "./projectiles.js";

const THROW_SPAWN_X = 38;
const THROW_SPAWN_Y = -PLAYER_HEIGHT * 0.55;
const THROW_ARC = -0.22;
/** Matches client throw sheet: 3 frames @ 10 fps — pose only, not projectile flight. */
export const THROW_ANIM_DURATION = 3 / 10;

export function canThrow(
  player: PlayerState,
  time: number,
  projectiles: readonly Projectile[] = [],
): boolean {
  if (player.lives <= 0) return false;
  if (playerHasActiveFlipflop(projectiles, player.id)) return false;
  return time >= player.throwCooldownEndsAt;
}

export function isThrowCharging(player: PlayerState): boolean {
  return (player.throwChargeStartedAt ?? 0) > 0;
}

export function getThrowCharge(player: PlayerState, time: number): number {
  if (!isThrowCharging(player)) return 0;
  return getCharge(time - player.throwChargeStartedAt, getAttack(FLIPFLOP_THROW_ID));
}

export function cancelThrowCharge(player: PlayerState): void {
  player.throwChargeStartedAt = 0;
}

export function startThrowCharge(
  player: PlayerState,
  time: number,
  projectiles: readonly Projectile[] = [],
): boolean {
  if (isThrowCharging(player)) return true;
  if (!canThrow(player, time, projectiles)) return false;
  if (player.attackState.type !== "idle" && player.attackState.type !== "recovery") return false;
  cancelAttackCharge(player);
  if (player.attackState.type === "recovery") {
    player.attackState = { type: "idle" };
  }
  player.throwChargeStartedAt = time;
  return true;
}

export function throwFlipflop(
  player: PlayerState,
  time: number,
  _aimAngle = 0,
  projectiles: readonly Projectile[] = [],
  charge = getThrowCharge(player, time),
): Projectile | null {
  const charging = isThrowCharging(player);
  if (charging) {
    if (player.lives <= 0 || playerHasActiveFlipflop(projectiles, player.id)) {
      cancelThrowCharge(player);
      return null;
    }
  } else if (!canThrow(player, time, projectiles)) {
    return null;
  }

  const attack = getAttack(FLIPFLOP_THROW_ID);
  const projectileDef = attack.projectile;
  if (!projectileDef) return null;

  const t = Math.min(1, Math.max(0, charge));
  const facingAngle = player.facing === 1 ? THROW_ARC : Math.PI - THROW_ARC;
  const speed = lerp(projectileDef.speed, projectileDef.maxSpeed ?? projectileDef.speed, t);

  cancelThrowCharge(player);
  player.throwCooldownEndsAt = Number.POSITIVE_INFINITY;
  player.throwAnimUntil = time + THROW_ANIM_DURATION;

  return createProjectile({
    id: `${player.id}-${Math.round(time * 1000)}`,
    ownerId: player.id,
    attackId: attack.id,
    throwableId: throwableIdFromAvatar(player.avatar?.throwableId),
    position: {
      x: player.position.x + player.facing * THROW_SPAWN_X,
      y: player.position.y + THROW_SPAWN_Y,
    },
    velocity: {
      x: Math.cos(facingAngle) * speed,
      y: Math.sin(facingAngle) * speed,
    },
    damage: attack.baseDamage,
    knockback: attack.baseKnockback,
    radius: projectileDef.radius,
    lifetime: projectileDef.lifetime,
  });
}

/** Auto-release at full charge, same idea as slap max-charge release. */
export function updateThrowCharge(
  player: PlayerState,
  time: number,
  projectiles: Projectile[],
): Projectile | null {
  if (!isThrowCharging(player)) return null;
  const attack = getAttack(FLIPFLOP_THROW_ID);
  const maxCharge = attack.maxChargeTime ?? 0;
  if (maxCharge <= 0) return null;
  if (time - player.throwChargeStartedAt < maxCharge) return null;
  return throwFlipflop(player, time, 0, projectiles, 1);
}

/**
 * Mirrors `syncAttackFromInput`: charge on throwHeld press, release on let-go.
 * Returns a spawned projectile when a throw fires (caller may ignore on client).
 */
export function syncThrowFromInput(
  player: PlayerState,
  input: PlayerInput,
  previousInput: PlayerInput,
  time: number,
  projectiles: Projectile[] = [],
): Projectile | null {
  if (input.throwHeld && !previousInput.throwHeld) {
    startThrowCharge(player, time, projectiles);
  }
  let spawned: Projectile | null = null;
  if (!input.throwHeld && previousInput.throwHeld) {
    spawned = throwFlipflop(player, time, input.aimAngle, projectiles);
    if (!spawned) cancelThrowCharge(player);
  }
  return spawned ?? updateThrowCharge(player, time, projectiles);
}
