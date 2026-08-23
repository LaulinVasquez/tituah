export type MatchRecordStatus = "started" | "completed" | "cancelled";

export interface MatchPlayerResult {
  knockouts: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface MatchRecord {
  id: string;
  status: MatchRecordStatus;
  players: string[];
  winnerId: string | null;
  mapId: string;
  startedAt: unknown;
  endedAt: unknown;
  durationMs: number | null;
  results: Record<string, MatchPlayerResult>;
}

export const XP_WIN = 80;
export const XP_LOSS = 25;
export const XP_PER_KO = 15;
