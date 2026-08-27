import { PLAYER_HEIGHT } from "../data/physics.js";
import { FLIPFLOP_THROW_ID, getAttack } from "../data/attacks.js";
import { throwableIdFromAvatar } from "../sprites/ids.js";
import type { PlayerState, Projectile } from "../types.js";
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

export function throwFlipflop(
  player: PlayerState,
  time: number,
  _aimAngle = 0,
  projectiles: readonly Projectile[] = [],
): Projectile | null {
  if (!canThrow(player, time, projectiles)) return null;

  const attack = getAttack(FLIPFLOP_THROW_ID);
  const projectileDef = attack.projectile;
  if (!projectileDef) return null;

  const facingAngle = player.facing === 1 ? THROW_ARC : Math.PI - THROW_ARC;
  const speed = projectileDef.speed;

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
