import {
  clonePlayerState,
  cloneSnapshot,
  type MatchSnapshot,
  type PlayerHitMessage,
  type PlayerRespawnMessage,
  type PlayerState,
} from "@tituah/shared";

export class GameState {
  localPlayerId: string | null = null;
  matchId: string | null = null;
  snapshot: MatchSnapshot | null = null;
  predicted: PlayerState | null = null;
  names = new Map<string, string>();
  lastHit: PlayerHitMessage | null = null;
  lastRespawn: PlayerRespawnMessage | null = null;
  winnerId: string | null = null;
  scores: Record<string, number> = {};

  setLocalPlayer(id: string, matchId: string, player: PlayerState): void {
    this.localPlayerId = id;
    this.matchId = matchId;
    this.predicted = clonePlayerState(player);
    this.names.set(id, player.name);
  }

  addRemoteName(id: string, name: string): void {
    this.names.set(id, name);
  }

  beginMatch(snapshot: MatchSnapshot, yourId: string): void {
    this.localPlayerId = yourId;
    this.snapshot = cloneSnapshot(snapshot);
    this.predicted = clonePlayerState(this.requirePlayer(snapshot, yourId));
    this.winnerId = null;
    this.scores = { ...snapshot.scores };
    for (const player of snapshot.players) {
      this.names.set(player.id, player.name);
    }
  }

  applySnapshot(snapshot: MatchSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    this.scores = { ...snapshot.scores };
  }

  endMatch(winnerId: string | null, scores: Record<string, number>): void {
    this.winnerId = winnerId;
    this.scores = { ...scores };
    if (this.snapshot) {
      this.snapshot = { ...this.snapshot, status: "ended" };
    }
  }

  removePlayer(playerId: string): void {
    this.names.delete(playerId);
  }

  noteHit(message: PlayerHitMessage): void {
    this.lastHit = message;
  }

  noteRespawn(message: PlayerRespawnMessage): void {
    this.lastRespawn = message;
  }

  getPlayer(id: string): PlayerState | null {
    return this.snapshot?.players.find((player) => player.id === id) ?? null;
  }

  localPlayer(): PlayerState | null {
    if (this.predicted) return this.predicted;
    if (!this.localPlayerId) return null;
    return this.getPlayer(this.localPlayerId);
  }

  playing(): boolean {
    return this.snapshot?.status === "playing";
  }

  private requirePlayer(snapshot: MatchSnapshot, id: string): PlayerState {
    const player = snapshot.players.find((entry) => entry.id === id);
    if (!player) {
      throw new Error(`Missing player ${id} in snapshot`);
    }
    return player;
  }
}
