import type { AttackDefinition } from "../types.js";

export const SLAP_ATTACK_ID = "slap";

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

export const ATTACKS: Record<string, AttackDefinition> = {
  [SLAP_ATTACK_ID]: SLAP_ATTACK,
};

export const PRIMARY_ATTACK_ID = SLAP_ATTACK_ID;

export function getAttack(id: string): AttackDefinition {
  const attack = ATTACKS[id];
  if (!attack) {
    throw new Error(`Unknown attack: ${id}`);
  }
  return attack;
}
