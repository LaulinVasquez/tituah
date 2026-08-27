import { PLAYER_HEIGHT } from "../data/physics.js";
import { FLIPFLOP_THROW_ID, getAttack } from "../data/attacks.js";
import { lerp } from "../math.js";
import { throwableIdFromAvatar } from "../sprites/ids.js";
import type { PlayerInput, PlayerState, Projectile } from "../types.js";
import { cancelAttackCharge, getCharge } from "./combat.js";
import { createProjectile, playerHasActiveFlipflop } from "./projectiles.js";

const THROW_SPAWN_Y = -PLAYER_HEIGHT * 0.55;
const THROW_ARC = -0.22;
/** Forward of body center toward facing — near the front edge / throwing hand. */
export const THROW_SPAWN_X = 64;
/** Matches client throw sheet: 3 frames @ 10 fps — pose only, not projectile flight. */
export const THROW_ANIM_DURATION = 3 / 10;

export function getThrowCooldownEndsAt(player: PlayerState): number {
  const endsAt = player.throwCooldownEndsAt;
  return Number.isFinite(endsAt) ? endsAt : 0;
}

export function canThrow(
  player: PlayerState,
  time: number,
  projectiles: readonly Projectile[] = [],
): boolean {
  if (player.lives <= 0) return false;
  // One item in flight at a time — reload once it leaves the playfield / despawns.
  if (playerHasActiveFlipflop(projectiles, player.id)) return false;
  return time >= getThrowCooldownEndsAt(player);
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
    if (player.lives <= 0) {
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
  // Hold reload until the projectile leaves (match clears this early) or lifetime ends.
  const reloadFor = Math.max(attack.cooldown ?? 0, projectileDef.lifetime);
  player.throwCooldownEndsAt = time + reloadFor;
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
 * Charge on throwHeld press, release on let-go.
 * Returns a spawned projectile when a throw fires.
 */
export function syncThrowFromInput(
  player: PlayerState,
  input: PlayerInput,
  previousInput: PlayerInput,
  time: number,
  projectiles: Projectile[] = [],
): Projectile | null {
  // Hold = charge whenever ready (rising edge alone misses cooldown expiry mid-hold).
  if (input.throwHeld) {
    startThrowCharge(player, time, projectiles);
  }
  let spawned: Projectile | null = null;
  if (!input.throwHeld && (previousInput.throwHeld || isThrowCharging(player))) {
    spawned = throwFlipflop(player, time, input.aimAngle, projectiles);
    if (!spawned) cancelThrowCharge(player);
  }
  return spawned ?? updateThrowCharge(player, time, projectiles);
}
