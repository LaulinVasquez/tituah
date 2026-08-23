import type { Vec2 } from "./math.js";

export type Facing = 1 | -1;

export type AttackType = "melee" | "projectile" | "hitscan" | "throwable";

export type MatchStatus = "waiting" | "playing" | "ended";

export type AttackState =
  | { type: "idle" }
  | {
      type: "charging";
      attackId: string;
      startedAt: number;
    }
  | {
      type: "active";
      attackId: string;
      startedAt: number;
      charge: number;
    }
  | {
      type: "recovery";
      attackId: string;
      endsAt: number;
    };

export interface AttackHitboxDef {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface AttackDefinition {
  id: string;
  type: AttackType;
  chargeTime?: number;
  maxChargeTime?: number;
  baseDamage: number;
  maxDamage?: number;
  baseKnockback: number;
  maxKnockback?: number;
  verticalKnockback: number;
  maxVerticalKnockback?: number;
  cooldown: number;
  activeDuration: number;
  hitbox: AttackHitboxDef;
  projectile?: ProjectileAttackDef;
}

export interface ProjectileAttackDef {
  speed: number;
  radius: number;
  lifetime: number;
}

export interface ChargedAttackValues {
  charge: number;
  damage: number;
  knockback: number;
  verticalKnockback: number;
  handScale: number;
  hitbox: AttackHitboxDef;
}

export interface PlayerState {
  id: string;
  name: string;
  position: Vec2;
  velocity: Vec2;
  facing: Facing;
  grounded: boolean;
  jumpsRemaining: number;
  health: number;
  damagePercent: number;
  attackState: AttackState;
  lives: number;
  lastInputSeq: number;
  spawnIndex: number;
  invulnerableUntil: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  attackId: string;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  knockback: number;
  radius: number;
  lifetime: number;
  age: number;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageMap {
  id: string;
  width: number;
  height: number;
  platforms: Platform[];
  spawns: Vec2[];
  blast: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

export interface PlayerInput {
  sequence: number;
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  attackHeld: boolean;
  aimAngle: number;
}

export interface MatchSnapshot {
  stageId: string;
  tick: number;
  time: number;
  status: MatchStatus;
  players: PlayerState[];
  projectiles: Projectile[];
  lastProcessedInput: Record<string, number>;
  scores: Record<string, number>;
}

export interface WorldEvents {
  hits: HitEvent[];
  respawns: RespawnEvent[];
  deaths: DeathEvent[];
}

export interface HitEvent {
  attackerId: string;
  targetId: string;
  attackId: string;
  damage: number;
  knockback: Vec2;
  charge: number;
}

export interface RespawnEvent {
  playerId: string;
  position: Vec2;
  lives: number;
}

export interface DeathEvent {
  playerId: string;
  lives: number;
}

export function emptyInput(sequence = 0): PlayerInput {
  return {
    sequence,
    left: false,
    right: false,
    down: false,
    jump: false,
    attackHeld: false,
    aimAngle: 0,
  };
}

export function cloneAttackState(state: AttackState): AttackState {
  return { ...state };
}

export function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    attackState: cloneAttackState(player.attackState),
  };
}

export function cloneProjectile(projectile: Projectile): Projectile {
  return {
    ...projectile,
    position: { ...projectile.position },
    velocity: { ...projectile.velocity },
  };
}

export function cloneSnapshot(snapshot: MatchSnapshot): MatchSnapshot {
  return {
    ...snapshot,
    players: snapshot.players.map(clonePlayerState),
    projectiles: snapshot.projectiles.map(cloneProjectile),
    lastProcessedInput: { ...snapshot.lastProcessedInput },
    scores: { ...snapshot.scores },
  };
}
