export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20;
export const SNAPSHOT_EVERY_TICKS = TICK_RATE / SNAPSHOT_RATE;
export const INTERPOLATION_DELAY = 0.1;
export const INPUT_HISTORY_LIMIT = 120;

export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 56;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_LIVES = 3;
export const RESPAWN_INVULN_TIME = 1.4;

export const MOVE_SPEED = 420;
export const GROUND_ACCEL = 4200;
export const AIR_ACCEL = 2600;
export const GROUND_FRICTION = 3200;
export const AIR_FRICTION = 400;
export const GRAVITY = 2200;
export const JUMP_VELOCITY = -780;
export const MAX_JUMPS = 2;
export const MAX_FALL_SPEED = 1500;

export const KNOCKBACK_SCALING = 0.014;
export const MIN_KNOCKBACK_SCALE = 1;
export const HIT_STUN_GRAVITY_SCALE = 1;

export const DEFAULT_HAND_SCALE = 1;
export const MAX_HAND_SCALE = 2.8;
export const HITBOX_RANGE_SCALE = 1.6;
