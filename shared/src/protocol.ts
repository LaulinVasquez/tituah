import type { MatchSnapshot, PlayerInput, PlayerState } from "./types.js";
import type { Vec2 } from "./math.js";

export type ClientMessage =
  | JoinMessage
  | ReadyMessage
  | StartMatchMessage
  | ClientInputMessage
  | AttackStartMessage
  | AttackReleaseMessage
  | ThrowStartMessage
  | ThrowReleaseMessage
  | ThrowMessage
  | RunningFourSlapMessage;

export type ServerMessage =
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerReadyMessage
  | MatchCountdownMessage
  | MatchStartedMessage
  | ServerSnapshot
  | PlayerHitMessage
  | PlayerRespawnMessage
  | MatchEndedMessage
  | ErrorMessage;

export interface JoinMessage {
  type: "join";
  name: string;
  stageId: string;
  idToken: string;
  /** `"any"` for open preference, or fixed 2 / 3 / 4. */
  playerCount: "any" | number;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface ClientInputMessage {
  type: "input";
  input: PlayerInput;
}

export interface AttackStartMessage {
  type: "attack_start";
}

export interface AttackReleaseMessage {
  type: "attack_release";
}

export interface ThrowStartMessage {
  type: "throw_start";
}

export interface ThrowReleaseMessage {
  type: "throw_release";
}

/** @deprecated Prefer throw_start / throw_release; kept as an instant base-power throw. */
export interface ThrowMessage {
  type: "throw";
}

export interface RunningFourSlapMessage {
  type: "running_four_slap";
}

export interface ReadyMessage {
  type: "ready";
}

export interface StartMatchMessage {
  type: "start_match";
}

export interface WelcomeMessage {
  type: "welcome";
  playerId: string;
  matchId: string;
  stageId: string;
  player: PlayerState;
  players: PlayerState[];
  maxPlayers: number;
  /** True when the lobby is open (any-preference); Start is client-driven. */
  openMatch: boolean;
  readyIds: string[];
  rematch: boolean;
  winnerId: string | null;
  placements: Record<string, number>;
}

export interface PlayerJoinedMessage {
  type: "player_joined";
  playerId: string;
  name: string;
  player: PlayerState;
  readyIds: string[];
}

export interface PlayerReadyMessage {
  type: "player_ready";
  playerId: string;
  readyIds: string[];
}

export interface PlayerLeftMessage {
  type: "player_left";
  playerId: string;
}

export interface MatchCountdownMessage {
  type: "match_countdown";
  seconds: number;
  snapshot: MatchSnapshot;
}

export interface MatchStartedMessage {
  type: "match_started";
  snapshot: MatchSnapshot;
  yourId: string;
}

export interface ServerSnapshot {
  type: "snapshot";
  snapshot: MatchSnapshot;
}

export interface PlayerHitMessage {
  type: "player_hit";
  attackerId: string;
  targetId: string;
  attackId: string;
  damage: number;
  knockback: Vec2;
  charge: number;
}

export interface PlayerRespawnMessage {
  type: "player_respawn";
  playerId: string;
  position: Vec2;
  lives: number;
}

export interface MatchEndedMessage {
  type: "match_ended";
  winnerId: string | null;
  scores: Record<string, number>;
  players: PlayerState[];
  maxPlayers: number;
  placements: Record<string, number>;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as ClientMessage;
    if (!data || typeof data.type !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data = JSON.parse(raw) as ServerMessage;
    if (!data || typeof data.type !== "string") return null;
    return data;
  } catch {
    return null;
  }
}
