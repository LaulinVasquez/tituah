import type { MatchSnapshot, PlayerInput, PlayerState } from "./types.js";
import type { Vec2 } from "./math.js";

export type ClientMessage =
  | JoinMessage
  | ClientInputMessage
  | AttackStartMessage
  | AttackReleaseMessage;

export type ServerMessage =
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | MatchStartedMessage
  | ServerSnapshot
  | PlayerHitMessage
  | PlayerRespawnMessage
  | MatchEndedMessage;

export interface JoinMessage {
  type: "join";
  name: string;
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

export interface WelcomeMessage {
  type: "welcome";
  playerId: string;
  matchId: string;
  player: PlayerState;
}

export interface PlayerJoinedMessage {
  type: "player_joined";
  playerId: string;
  name: string;
}

export interface PlayerLeftMessage {
  type: "player_left";
  playerId: string;
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
