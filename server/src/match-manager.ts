import {
  getStage,
  isStageId,
  parsePlayerCountPreference,
  randomStageId,
  TICK_DT,
  TICK_RATE,
  type PlayerCount,
  type PlayerCountPreference,
  type PlayerInput,
  type ServerMessage,
  type StageId,
} from "@tituah/shared";
import { Match } from "./match.js";
import type { Session } from "./session.js";
import { createUserProfile, recordMatchResult } from "./services/firebase/game-data.js";
import { matchesRepository } from "./repositories/matches.repository.js";
import { verifyIdToken } from "./services/firebase/firebaseAdmin.js";

export class MatchManager {
  private readonly matches = new Map<string, Match>();
  private readonly waitingByRoom = new Map<string, Match[]>();
  private readonly sessionsByPlayer = new Map<string, Session>();
  private accumulator = 0;
  private lastTime = performance.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async join(
    session: Session,
    name: string,
    idToken: string,
    requestedStageId: string,
    requestedPlayerCount?: unknown,
  ): Promise<Match> {
    const decoded = await verifyIdToken(idToken);
    const profile = await createUserProfile(decoded.uid, {
      displayName: name,
    });

    session.uid = profile.uid;
    session.name = profile.displayName;

    const existing = this.sessionsByPlayer.get(profile.uid);
    if (existing && existing !== session) {
      this.leave(existing);
    }
    if (session.matchId) {
      this.leave(session);
    }

    session.playerId = profile.uid;

    const preference = parsePlayerCountPreference(requestedPlayerCount);
    const match = this.getOrCreateWaitingMatch(requestedStageId, preference);
    const player = match.addPlayer(profile.uid, profile.displayName, profile.avatar);
    session.matchId = match.id;
    this.sessionsByPlayer.set(player.id, session);

    const roster = [...match.players.values()];
    const readyIds = match.readyIds();
    session.socket.send(
      JSON.stringify({
        type: "welcome",
        playerId: player.id,
        matchId: match.id,
        stageId: match.map.id,
        player,
        players: roster,
        maxPlayers: match.maxPlayers,
        openMatch: match.openMatch,
        readyIds,
        rematch: match.rematch,
        winnerId: match.winnerId,
        placements: { ...match.placements },
      } satisfies ServerMessage),
    );

    this.broadcast(match, session.playerId, {
      type: "player_joined",
      playerId: player.id,
      name: player.name,
      player,
      readyIds,
    });

    this.tryStart(match);

    return match;
  }

  leave(session: Session): void {
    if (!session.matchId || !session.playerId) return;
    const match = this.matches.get(session.matchId);
    this.sessionsByPlayer.delete(session.playerId);
    if (!match) return;

    match.removePlayer(session.playerId);
    if (match.status === "waiting" && match.rematch) {
      match.resetToMatchmaking();
    }
    this.broadcast(match, session.playerId, {
      type: "player_left",
      playerId: session.playerId,
    });

    if (match.playerCount === 0) {
      this.removeFromWaiting(match);
      this.matches.delete(match.id);
    } else if (match.status === "waiting") {
      this.ensureWaiting(match);
    }
    session.playerId = null;
    session.matchId = null;
  }

  handleInput(session: Session, input: PlayerInput): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.handleInput(session.playerId, input);
  }

  startAttack(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.startAttack(session.playerId);
  }

  releaseAttack(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.releaseAttack(session.playerId);
  }

  throwStart(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.throwStart(session.playerId);
  }

  throwRelease(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.throwRelease(session.playerId);
  }

  throw(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.throw(session.playerId);
  }

  runningFourSlap(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    match.runningFourSlap(session.playerId);
  }

  ready(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    if (!match.markReady(session.playerId)) return;
    this.broadcast(match, null, {
      type: "player_ready",
      playerId: session.playerId,
      readyIds: match.readyIds(),
    });
    this.tryStart(match);
  }

  startMatch(session: Session): void {
    const match = this.getSessionMatch(session);
    if (!match || !session.playerId) return;
    if (!match.requestStart(session.playerId)) return;
    this.tryStart(match);
  }

  private getSessionMatch(session: Session): Match | null {
    if (!session.matchId) return null;
    return this.matches.get(session.matchId) ?? null;
  }

  private roomKey(stageId: string, bucket: "open" | PlayerCount): string {
    return `${stageId}:${bucket}`;
  }

  private roomKeyForMatch(match: Match): string {
    return match.openMatch
      ? this.roomKey(match.map.id, "open")
      : this.roomKey(match.map.id, match.maxPlayers);
  }

  private isCompatible(match: Match, preference: PlayerCountPreference): boolean {
    if (match.status !== "waiting" || match.playerCount >= match.maxPlayers) return false;
    if (match.openMatch) return preference === "any";
    if (preference === "any") return true;
    return match.maxPlayers === preference;
  }

  private fillRatio(match: Match): number {
    return match.playerCount / match.maxPlayers;
  }

  private findCompatibleWaitingMatch(
    preference: PlayerCountPreference,
    stageId?: StageId,
  ): Match | undefined {
    const candidates: Match[] = [];
    for (const [key, rooms] of this.waitingByRoom) {
      if (stageId && !key.startsWith(`${stageId}:`)) continue;
      for (const match of rooms) {
        if (this.isCompatible(match, preference)) candidates.push(match);
      }
    }
    if (!candidates.length) return undefined;
    candidates.sort((a, b) => this.fillRatio(b) - this.fillRatio(a));
    return candidates[0];
  }

  private getOrCreateWaitingMatch(
    requestedStageId: string,
    preference: PlayerCountPreference,
  ): Match {
    const preferAnyStage = requestedStageId === "any";
    if (preferAnyStage) {
      const open = this.findCompatibleWaitingMatch(preference);
      if (open) return open;
      return this.createWaitingMatch(randomStageId(), preference);
    }

    const stageId = isStageId(requestedStageId) ? requestedStageId : "barnyard";
    const open = this.findCompatibleWaitingMatch(preference, stageId);
    if (open) return open;
    return this.createWaitingMatch(stageId, preference);
  }

  private createWaitingMatch(stageId: StageId, preference: PlayerCountPreference): Match {
    const openMatch = preference === "any";
    const maxPlayers: PlayerCount = openMatch ? 4 : preference;
    const key = openMatch ? this.roomKey(stageId, "open") : this.roomKey(stageId, maxPlayers);
    const rooms = this.waitingByRoom.get(key) ?? [];
    const stage = getStage(stageId);
    const match = new Match(
      crypto.randomUUID(),
      (playerId, message) => {
        this.send(match, playerId, message);
      },
      stage,
      {
        onStart: (started) => {
          void matchesRepository
            .createStarted({
              id: started.id,
              players: [...started.players.keys()],
              mapId: started.map.id,
            })
            .catch((error) => console.error("Failed to persist match start", error));
        },
        onEnd: (ended) => {
          void recordMatchResult({
            id: ended.id,
            status: "completed",
            players: [...ended.players.keys()],
            winnerId: ended.winnerId,
            mapId: ended.map.id,
            startedAt: null,
            endedAt: null,
            durationMs: Math.round(ended.time * 1000),
            results: ended.combatResults(),
          }).catch((error) => console.error("Failed to persist match result", error));
          ended.beginRematch();
          if (ended.playerCount > 0 && ended.playerCount < ended.maxPlayers) {
            this.ensureWaiting(ended);
          }
        },
      },
      maxPlayers,
      openMatch,
    );
    this.matches.set(match.id, match);
    rooms.push(match);
    this.waitingByRoom.set(key, rooms);
    return match;
  }

  private removeFromWaiting(match: Match): void {
    // Prefer the key derived from current flags; also scrub any stale key if size locked mid-life.
    const keys = new Set([
      this.roomKeyForMatch(match),
      this.roomKey(match.map.id, "open"),
      this.roomKey(match.map.id, match.maxPlayers),
    ]);
    for (const key of keys) {
      const rooms = this.waitingByRoom.get(key);
      if (!rooms) continue;
      const next = rooms.filter((entry) => entry !== match);
      if (next.length) this.waitingByRoom.set(key, next);
      else this.waitingByRoom.delete(key);
    }
  }

  private ensureWaiting(match: Match): void {
    if (match.status !== "waiting") return;
    const key = this.roomKeyForMatch(match);
    const rooms = this.waitingByRoom.get(key) ?? [];
    if (!rooms.includes(match)) {
      rooms.push(match);
      this.waitingByRoom.set(key, rooms);
    }
  }

  private tryStart(match: Match): void {
    if (!match.canStart()) return;
    this.removeFromWaiting(match);
    match.beginCountdown();
  }

  private send(match: Match, playerId: string | null, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    if (playerId) {
      this.sessionsByPlayer.get(playerId)?.socket.send(payload);
      return;
    }
    this.broadcast(match, null, message, payload);
  }

  private broadcast(
    match: Match,
    exceptPlayerId: string | null,
    message: ServerMessage,
    payload = JSON.stringify(message),
  ): void {
    for (const player of match.players.values()) {
      if (player.id === exceptPlayerId) continue;
      this.sessionsByPlayer.get(player.id)?.socket.send(payload);
    }
  }

  private tick(): void {
    const now = performance.now();
    this.accumulator += (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.accumulator = Math.min(this.accumulator, 0.25);

    while (this.accumulator >= TICK_DT) {
      for (const match of this.matches.values()) {
        match.update(TICK_DT);
      }
      this.accumulator -= TICK_DT;
    }
  }
}
