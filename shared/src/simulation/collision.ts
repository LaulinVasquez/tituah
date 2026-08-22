import { aabbOverlap, playerBounds, type AABB } from "../math.js";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../data/physics.js";
import type { Platform, PlayerState } from "../types.js";

export function getPlayerAABB(player: PlayerState): AABB {
  return playerBounds(player.position, PLAYER_WIDTH, PLAYER_HEIGHT);
}

export function resolveHorizontalCollisions(
  player: PlayerState,
  platforms: Platform[],
): void {
  const box = getPlayerAABB(player);
  for (const platform of platforms) {
    if (!aabbOverlap(box, platform)) continue;
    const overlapLeft = box.x + box.width - platform.x;
    const overlapRight = platform.x + platform.width - box.x;
    if (overlapLeft < overlapRight) {
      player.position.x -= overlapLeft;
    } else {
      player.position.x += overlapRight;
    }
    player.velocity.x = 0;
    box.x = player.position.x - PLAYER_WIDTH / 2;
  }
}

export function resolveVerticalCollisions(
  player: PlayerState,
  platforms: Platform[],
  previousBottom: number,
): void {
  player.grounded = false;
  const box = getPlayerAABB(player);

  for (const platform of platforms) {
    if (!aabbOverlap(box, platform)) continue;

    if (player.velocity.y >= 0 && previousBottom <= platform.y + 6) {
      player.position.y = platform.y;
      player.velocity.y = 0;
      player.grounded = true;
      box.y = player.position.y - PLAYER_HEIGHT;
      continue;
    }

    if (player.velocity.y < 0) {
      player.position.y = platform.y + platform.height + PLAYER_HEIGHT;
      player.velocity.y = 0;
      box.y = player.position.y - PLAYER_HEIGHT;
    }
  }
}

export function isInBlastZone(
  player: PlayerState,
  blast: { left: number; right: number; top: number; bottom: number },
): boolean {
  const { x, y } = player.position;
  return x < blast.left || x > blast.right || y < blast.top || y > blast.bottom;
}
