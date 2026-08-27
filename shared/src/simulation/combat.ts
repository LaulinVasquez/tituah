import { clamp, lerp, playerBounds, type AABB } from "../math.js";
import {
  DEFAULT_HAND_SCALE,
  HITBOX_RANGE_SCALE,
  KNOCKBACK_SCALING,
  MAX_HAND_SCALE,
  MIN_KNOCKBACK_SCALE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from "../data/physics.js";
import { getAttack, PRIMARY_ATTACK_ID, RUN_SLAP_COMBO_ID, RUN_SLAP_FPS, RUN_SLAP_HIT_FRAME_INDICES } from "../data/attacks.js";
import { MOVE_SPEED } from "../data/physics.js";
import type {
  AttackDefinition,
  AttackHitboxDef,
  AttackState,
  ChargedAttackValues,
  HitEvent,
  PlayerInput,
  PlayerState,
} from "../types.js";

export function getCharge(duration: number, attack: AttackDefinition): number {
  const maxCharge = attack.maxChargeTime ?? 0;
  if (maxCharge <= 0) return 1;
  return clamp(duration / maxCharge, 0, 1);
}

export function getChargedAttackValues(
  attack: AttackDefinition,
  charge: number,
): ChargedAttackValues {
  const t = clamp(charge, 0, 1);
  const hitbox: AttackHitboxDef = {
    width: attack.hitbox.width * (1 + t * HITBOX_RANGE_SCALE),
    height: attack.hitbox.height * (1 + t * 0.35),
    offsetX: attack.hitbox.offsetX + t * 36,
    offsetY: attack.hitbox.offsetY,
  };

  return {
    charge: t,
    damage: lerp(attack.baseDamage, attack.maxDamage ?? attack.baseDamage, t),
    knockback: lerp(attack.baseKnockback, attack.maxKnockback ?? attack.baseKnockback, t),
    verticalKnockback: lerp(
      attack.verticalKnockback,
      attack.maxVerticalKnockback ?? attack.verticalKnockback,
      t,
    ),
    handScale: lerp(DEFAULT_HAND_SCALE, MAX_HAND_SCALE, t),
    hitbox,
  };
}

export function getAttackChargeFromState(
  state: AttackState,
  time: number,
): number {
  if (state.type === "charging") {
    return getCharge(time - state.startedAt, getAttack(state.attackId));
  }
  if (state.type === "active") {
    return state.charge;
  }
  return 0;
}

export function getMeleeHitbox(
  player: PlayerState,
  values: ChargedAttackValues,
): AABB {
  const { hitbox } = values;
  const centerX = player.position.x + hitbox.offsetX * player.facing;
  const centerY = player.position.y + hitbox.offsetY;
  return {
    x: centerX - hitbox.width / 2,
    y: centerY - hitbox.height / 2,
    width: hitbox.width,
    height: hitbox.height,
  };
}

export function getHandVisual(
  player: PlayerState,
  time: number,
): { scale: number; offsetX: number; offsetY: number } {
  const charge = getAttackChargeFromState(player.attackState, time);
  const attackId =
    player.attackState.type === "idle" ? PRIMARY_ATTACK_ID : player.attackState.attackId;
  const values = getChargedAttackValues(getAttack(attackId), charge);
  const activeBoost = player.attackState.type === "active" ? 0.35 : 0;
  return {
    scale: values.handScale + activeBoost,
    offsetX: (28 + charge * 26) * player.facing,
    offsetY: -PLAYER_HEIGHT * 0.45,
  };
}

export function applyHit(
  attacker: PlayerState,
  target: PlayerState,
  values: ChargedAttackValues,
): HitEvent {
  const direction = target.position.x >= attacker.position.x ? 1 : -1;
  const scale = Math.max(
    MIN_KNOCKBACK_SCALE,
    1 + target.damagePercent * KNOCKBACK_SCALING,
  );
  const knockbackX = values.knockback * scale * direction;
  const knockbackY = -values.verticalKnockback * scale;

  target.damagePercent += values.damage;
  target.health = Math.max(0, target.health - values.damage);
  target.velocity.x += knockbackX;
  target.velocity.y += knockbackY;
  target.grounded = false;

  return {
    attackerId: attacker.id,
    targetId: target.id,
    attackId: attacker.attackState.type === "idle" ? PRIMARY_ATTACK_ID : attacker.attackState.attackId,
    damage: values.damage,
    knockback: { x: knockbackX, y: knockbackY },
    charge: values.charge,
  };
}

export function playerCanStartAttack(player: PlayerState): boolean {
  return player.attackState.type === "idle" && player.lives > 0;
}

export function cancelAttackCharge(player: PlayerState): void {
  if (player.attackState.type === "charging") {
    player.attackState = { type: "idle" };
  }
}

export function triggerRunningFourSlap(player: PlayerState, time: number): boolean {
  if (player.lives <= 0) return false;
  cancelAttackCharge(player);
  // Allow run-slap to take over a light slap that already started from the first tap.
  if (
    player.attackState.type === "recovery"
    || player.attackState.type === "active"
  ) {
    player.attackState = { type: "idle" };
  }
  if (player.attackState.type !== "idle") return false;

  player.attackState = {
    type: "combo",
    attackId: RUN_SLAP_COMBO_ID,
    startedAt: time,
  };
  player.velocity.x = MOVE_SPEED * player.facing * 0.88;
  return true;
}

export function comboHitTime(startedAt: number, hitIndex: number): number {
  const frame = RUN_SLAP_HIT_FRAME_INDICES[hitIndex] ?? RUN_SLAP_HIT_FRAME_INDICES.at(-1)!;
  return startedAt + (frame + 0.5) / RUN_SLAP_FPS;
}

export function isComboAttack(state: AttackState): boolean {
  return state.type === "combo";
}

export function startAttack(
  player: PlayerState,
  time: number,
  attackId = PRIMARY_ATTACK_ID,
): void {
  if (!playerCanStartAttack(player)) return;
  player.attackState = {
    type: "charging",
    attackId,
    startedAt: time,
  };
}

export function releaseAttack(player: PlayerState, time: number): number {
  if (player.attackState.type !== "charging") return 0;
  const attack = getAttack(player.attackState.attackId);
  const charge = getCharge(time - player.attackState.startedAt, attack);
  player.attackState = {
    type: "active",
    attackId: attack.id,
    startedAt: time,
    charge,
  };
  return charge;
}

export function updateAttackState(player: PlayerState, time: number): void {
  const state = player.attackState;
  if (state.type === "charging") {
    const attack = getAttack(state.attackId);
    const maxCharge = attack.maxChargeTime ?? 0;
    if (maxCharge > 0 && time - state.startedAt >= maxCharge) {
      releaseAttack(player, time);
    }
    return;
  }

  if (state.type === "active") {
    const attack = getAttack(state.attackId);
    if (time - state.startedAt >= attack.activeDuration) {
      player.attackState = {
        type: "recovery",
        attackId: state.attackId,
        endsAt: time + attack.cooldown,
      };
    }
    return;
  }

  if (state.type === "combo") {
    const attack = getAttack(state.attackId);
    if (time - state.startedAt >= attack.activeDuration) {
      player.attackState = {
        type: "recovery",
        attackId: state.attackId,
        endsAt: time + attack.cooldown,
      };
    }
    return;
  }

  if (state.type === "recovery" && time >= state.endsAt) {
    player.attackState = { type: "idle" };
  }
}

export function syncAttackFromInput(
  player: PlayerState,
  input: PlayerInput,
  previousInput: PlayerInput,
  time: number,
): void {
  if (player.attackState.type !== "combo") {
    if (input.attackHeld && !previousInput.attackHeld) {
      startAttack(player, time);
    }
    if (!input.attackHeld && previousInput.attackHeld) {
      releaseAttack(player, time);
    }
  }
  updateAttackState(player, time);
}

export function getBodyAABB(player: PlayerState): AABB {
  return playerBounds(player.position, PLAYER_WIDTH, PLAYER_HEIGHT);
}
