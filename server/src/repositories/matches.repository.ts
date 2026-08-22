import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { MatchRecord } from "@tituah/shared";
import { adminDb } from "../services/firebase/firebaseAdmin.js";

export class MatchesRepository {
  private col() {
    return adminDb().collection("matches");
  }

  doc(matchId: string): DocumentReference {
    return this.col().doc(matchId);
  }

  async get(matchId: string): Promise<MatchRecord | null> {
    const snap = await this.doc(matchId).get();
    return snap.exists ? (snap.data() as MatchRecord) : null;
  }

  async createStarted(match: Pick<MatchRecord, "id" | "players" | "mapId">): Promise<void> {
    await this.doc(match.id).set({
      id: match.id,
      status: "started",
      players: match.players,
      winnerId: null,
      mapId: match.mapId,
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      durationMs: null,
      results: {},
    });
  }

  writeCompleted(tx: Transaction, match: MatchRecord): void {
    tx.set(this.doc(match.id), {
      ...match,
      endedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

export const matchesRepository = new MatchesRepository();
