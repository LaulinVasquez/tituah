import type { WebSocket } from "ws";

export class Session {
  readonly id: string;
  playerId: string | null = null;
  matchId: string | null = null;
  name = "Fighter";
  lastSeenAt = Date.now();

  constructor(
    id: string,
    readonly socket: WebSocket,
  ) {
    this.id = id;
  }

  markSeen(): void {
    this.lastSeenAt = Date.now();
  }
}
