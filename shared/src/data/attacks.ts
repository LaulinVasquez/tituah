import type { AttackDefinition } from "../types.js";

export const SLAP_ATTACK_ID = "slap";
export const FLIPFLOP_THROW_ID = "flipflop_throw";
export const RUN_SLAP_COMBO_ID = "run_slap_combo";

export const SLAP_ATTACK: AttackDefinition = {
  id: SLAP_ATTACK_ID,
  type: "melee",
  maxChargeTime: 1.15,
  baseDamage: 8,
  maxDamage: 24,
  baseKnockback: 420,
  maxKnockback: 980,
  verticalKnockback: 280,
  maxVerticalKnockback: 620,
  cooldown: 0.32,
  activeDuration: 0.09,
  hitbox: {
    width: 52,
    height: 42,
    offsetX: 38,
    offsetY: -18,
  },
};

export const RUN_SLAP_HIT_COUNT = 3;
export const RUN_SLAP_HIT_FRAME_INDICES = [1, 3, 5] as const;
export const RUN_SLAP_FPS = 14;
export const RUN_SLAP_FRAME_COUNT = 6;
export const RUN_SLAP_COMBO_CHARGE = 0.25;

export const RUN_SLAP_COMBO: AttackDefinition = {
  id: RUN_SLAP_COMBO_ID,
  type: "melee",
  baseDamage: 7,
  baseKnockback: 340,
  verticalKnockback: 210,
  cooldown: 0.55,
  activeDuration: RUN_SLAP_FRAME_COUNT / RUN_SLAP_FPS,
  hitbox: {
    width: 56,
    height: 44,
    offsetX: 44,
    offsetY: -16,
  },
};

export const FLIPFLOP_THROW: AttackDefinition = {
  id: FLIPFLOP_THROW_ID,
  type: "throwable",
  maxChargeTime: 1.05,
  baseDamage: 14,
  maxDamage: 38,
  baseKnockback: 420,
  maxKnockback: 1100,
  verticalKnockback: 220,
  maxVerticalKnockback: 560,
  /** Unused for throw gate — reload is “projectile left the playfield”. */
  cooldown: 0,
  activeDuration: 0.01,
  hitbox: {
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
  },
  projectile: {
    speed: 920,
    maxSpeed: 1680,
    radius: 30,
    /** Failsafe only; normal despawn is leaving the blast/frame. */
    lifetime: 6,
  },
};

export const ATTACKS: Record<string, AttackDefinition> = {
  [SLAP_ATTACK_ID]: SLAP_ATTACK,
  [RUN_SLAP_COMBO_ID]: RUN_SLAP_COMBO,
  [FLIPFLOP_THROW_ID]: FLIPFLOP_THROW,
};

export const PRIMARY_ATTACK_ID = SLAP_ATTACK_ID;

export function getAttack(id: string): AttackDefinition {
  const attack = ATTACKS[id];
  if (!attack) {
    throw new Error(`Unknown attack: ${id}`);
  }
  return attack;
}
