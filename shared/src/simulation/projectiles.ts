import { aabbOverlap } from "../math.js";
import type { HitEvent, PlayerState, Projectile } from "../types.js";
import { getBodyAABB } from "./combat.js";

export function createProjectile(partial: Omit<Projectile, "age"> & { age?: number }): Projectile {
  return {
    ...partial,
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

      const direction = player.position.x >= projectile.position.x ? 1 : -1;
      player.damagePercent += projectile.damage;
      player.health = Math.max(0, player.health - projectile.damage);
      player.velocity.x += projectile.knockback * direction;
      player.velocity.y -= projectile.knockback * 0.35;
      player.grounded = false;
      hits.push({
        attackerId: projectile.ownerId,
        targetId: player.id,
        attackId: projectile.attackId,
        damage: projectile.damage,
        knockback: {
          x: projectile.knockback * direction,
          y: -projectile.knockback * 0.35,
        },
        charge: 1,
      });
      consumed = true;
      break;
    }
    if (!consumed) remaining.push(projectile);
  }

  return { remaining, hits };
}
