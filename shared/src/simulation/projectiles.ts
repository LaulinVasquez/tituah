import { FLIPFLOP_THROW_ID, getAttack } from "../data/attacks.js";
import { KNOCKBACK_SCALING, MIN_KNOCKBACK_SCALE } from "../data/physics.js";
import { aabbOverlap, clamp } from "../math.js";
import type { HitEvent, PlayerState, Projectile } from "../types.js";
import { getBodyAABB, getChargedAttackValues } from "./combat.js";

export interface BlastBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isProjectileInBlastZone(projectile: Projectile, blast: BlastBounds): boolean {
  const { x, y } = projectile.position;
  return x >= blast.left && x <= blast.right && y >= blast.top && y <= blast.bottom;
}

export function playerHasActiveFlipflop(projectiles: readonly Projectile[], playerId: string): boolean {
  return projectiles.some(
    (projectile) => projectile.ownerId === playerId && projectile.attackId === FLIPFLOP_THROW_ID,
  );
}

export function findActiveFlipflop(
  projectiles: readonly Projectile[],
  playerId: string,
): Projectile | undefined {
  return projectiles.find(
    (projectile) => projectile.ownerId === playerId && projectile.attackId === FLIPFLOP_THROW_ID,
  );
}

/** 0 when the sandal just left the hand, 1 when it reaches the blast-zone edge. */
export function flipflopThrowReloadProgress(projectile: Projectile, blast: BlastBounds): number {
  const centerX = (blast.left + blast.right) * 0.5;
  const centerY = (blast.top + blast.bottom) * 0.5;
  const halfWidth = Math.max(1, (blast.right - blast.left) * 0.5);
  const halfHeight = Math.max(1, (blast.bottom - blast.top) * 0.5);
  const dx = Math.abs(projectile.position.x - centerX) / halfWidth;
  const dy = Math.abs(projectile.position.y - centerY) / halfHeight;
  return Math.min(1, Math.max(dx, dy, 0));
}

export function createProjectile(partial: Omit<Projectile, "age"> & { age?: number }): Projectile {
  return {
    ...partial,
    throwableId: partial.throwableId || "sandal",
    age: partial.age ?? 0,
  };
}

export function updateProjectiles(projectiles: Projectile[], dt: number): Projectile[] {
  const next: Projectile[] = [];
  for (const projectile of projectiles) {
    projectile.age += dt;
    if (projectile.age >= projectile.lifetime) continue;
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.y += projectile.velocity.y * dt;
    next.push(projectile);
  }
  return next;
}

export function resolveProjectileHits(
  projectiles: Projectile[],
  players: PlayerState[],
): { remaining: Projectile[]; hits: HitEvent[] } {
  const remaining: Projectile[] = [];
  const hits: HitEvent[] = [];

  for (const projectile of projectiles) {
    let consumed = false;
    for (const player of players) {
      if (player.id === projectile.ownerId || player.lives <= 0) continue;
      const body = getBodyAABB(player);
      const box = {
        x: projectile.position.x - projectile.radius,
        y: projectile.position.y - projectile.radius,
        width: projectile.radius * 2,
        height: projectile.radius * 2,
      };
      if (!aabbOverlap(body, box)) continue;

      const attack = getAttack(projectile.attackId);
      const damageSpan = (attack.maxDamage ?? attack.baseDamage) - attack.baseDamage;
      const charge =
        damageSpan > 0
          ? clamp((projectile.damage - attack.baseDamage) / damageSpan, 0, 1)
          : 1;
      const values = getChargedAttackValues(attack, charge);
      const scale = Math.max(
        MIN_KNOCKBACK_SCALE,
        1 + player.damagePercent * KNOCKBACK_SCALING,
      );
      const direction = player.position.x >= projectile.position.x ? 1 : -1;
      const knockbackX = values.knockback * scale * direction;
      const knockbackY = -values.verticalKnockback * scale;

      player.damagePercent += values.damage;
      player.health = Math.max(0, player.health - values.damage);
      player.velocity.x += knockbackX;
      player.velocity.y += knockbackY;
      player.grounded = false;
      hits.push({
        attackerId: projectile.ownerId,
        targetId: player.id,
        attackId: projectile.attackId,
        damage: values.damage,
        knockback: {
          x: knockbackX,
          y: knockbackY,
        },
        charge: values.charge,
      });
      consumed = true;
      break;
    }
    if (!consumed) remaining.push(projectile);
  }

  return { remaining, hits };
}
