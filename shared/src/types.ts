import { emptyAvatar, type AvatarConfiguration } from "./firebase/user.js";
import type { Vec2 } from "./math.js";

export type Facing = 1 | -1;

export type AttackType = "melee" | "projectile" | "hitscan" | "throwable";

export type MatchStatus = "waiting" | "countdown" | "playing" | "ended";

export type PlayerCount = 2 | 3 | 4;

export const PLAYER_COUNTS = [2, 3, 4] as const;

export function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export function parsePlayerCount(value: unknown): PlayerCount {
  const numeric = typeof value === "string" ? Number(value) : value;
  return numeric === 3 || numeric === 4 ? numeric : 2;
}

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
    }
  | {
      type: "combo";
      attackId: string;
      startedAt: number;
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
  /** Fully-charged throw speed; defaults to `speed` when omitted. */
  maxSpeed?: number;
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
  throwCooldownEndsAt: number;
  /** Client plays throw pose while `time < throwAnimUntil`. */
  throwAnimUntil: number;
  /** > 0 while holding throw charge; 0 when not charging. */
  throwChargeStartedAt: number;
  lives: number;
  lastInputSeq: number;
  spawnIndex: number;
  invulnerableUntil: number;
  avatar: AvatarConfiguration;
}

export interface Projectile {
  id: string;
  ownerId: string;
  attackId: string;
  /** Visual / carried throwable for this projectile (`sandal` default). */
  throwableId: string;
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
  /** Hold-to-charge throw — same rising/falling edge model as `attackHeld`. */
  throwHeld: boolean;
  aimAngle: number;
  runningSlap?: boolean;
}

export interface MatchSnapshot {
  stageId: string;
  tick: number;
  time: number;
  status: MatchStatus;
  maxPlayers: PlayerCount;
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
    throwHeld: false,
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
    throwAnimUntil: player.throwAnimUntil ?? 0,
    throwChargeStartedAt: player.throwChargeStartedAt ?? 0,
    avatar: { ...emptyAvatar(), ...(player.avatar ?? {}) },
  };
}

export function cloneProjectile(projectile: Projectile): Projectile {
  return {
    ...projectile,
    throwableId: projectile.throwableId || "sandal",
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
