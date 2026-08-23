import { getStage, isStageId, TICK_DT, TICK_RATE, type PlayerInput, type ServerMessage } from "@tituah/shared";
import { Match } from "./match.js";
import type { Session } from "./session.js";
import { createUserProfile, recordMatchResult } from "./services/firebase/game-data.js";
import { matchesRepository } from "./repositories/matches.repository.js";
import { verifyIdToken } from "./services/firebase/firebaseAdmin.js";

const PLAYERS_PER_MATCH = 2;

export class MatchManager {
  private readonly matches = new Map<string, Match>();
  private waiting: Match | null = null;
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

    const match = this.getOrCreateWaitingMatch(requestedStageId);
    const player = match.addPlayer(profile.uid, profile.displayName, profile.avatar);
    session.matchId = match.id;
    this.sessionsByPlayer.set(player.id, session);

    session.socket.send(
      JSON.stringify({
        type: "welcome",
        playerId: player.id,
        matchId: match.id,
        player,
      } satisfies ServerMessage),
    );

    this.broadcast(match, session.playerId, {
      type: "player_joined",
      playerId: player.id,
      name: player.name,
    });

    if (match.playerCount >= PLAYERS_PER_MATCH) {
      this.waiting = null;
      match.start();
    }

    return match;
  }

  leave(session: Session): void {
    if (!session.matchId || !session.playerId) return;
    const match = this.matches.get(session.matchId);
    this.sessionsByPlayer.delete(session.playerId);
    if (!match) return;

    match.removePlayer(session.playerId);
    this.broadcast(match, session.playerId, {
      type: "player_left",
      playerId: session.playerId,
    });

    if (this.waiting === match) {
      this.waiting = null;
    }
    if (match.playerCount === 0) {
      this.matches.delete(match.id);
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

  private getSessionMatch(session: Session): Match | null {
    if (!session.matchId) return null;
    return this.matches.get(session.matchId) ?? null;
  }

  private getOrCreateWaitingMatch(requestedStageId: string): Match {
    if (this.waiting && this.waiting.status === "waiting") {
      return this.waiting;
    }
    const stage = getStage(isStageId(requestedStageId) ? requestedStageId : "barnyard");
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
        },
      },
    );
    this.matches.set(match.id, match);
    this.waiting = match;
    return match;
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
