import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import {
  defaultUserProfile,
  type UserProfile,
  type UserProgression,
  type UserStats,
} from "@tituah/shared";
import { adminDb } from "../services/firebase/firebaseAdmin.js";

export class UsersRepository {
  private col() {
    return adminDb().collection("users");
  }

  doc(uid: string): DocumentReference {
    return this.col().doc(uid);
  }

  async get(uid: string): Promise<UserProfile | null> {
    const snap = await this.doc(uid).get();
    return snap.exists ? (snap.data() as UserProfile) : null;
  }

  async create(
    uid: string,
    data: { username?: string; displayName?: string },
  ): Promise<UserProfile> {
    const profile = defaultUserProfile(uid, data);
    const payload = {
      ...profile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await this.doc(uid).create(payload);
    const created = await this.get(uid);
    if (!created) throw new Error(`Failed to create user ${uid}`);
    return created;
  }

  async updateSafeProfile(
    uid: string,
    updates: {
      displayName?: string;
      username?: string;
      baseAvatarId?: string;
      throwableId?: string;
      faceAccessoryId?: string | null;
    },
  ): Promise<void> {
    const next: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (updates.displayName) next.displayName = updates.displayName.trim();
    if (updates.username) next.username = updates.username.trim();
    if (updates.baseAvatarId) next["avatar.baseAvatarId"] = updates.baseAvatarId;
    if (updates.throwableId) next["avatar.throwableId"] = updates.throwableId;
    if (updates.faceAccessoryId !== undefined) {
      next["avatar.faceAccessoryId"] = updates.faceAccessoryId;
    }
    await this.doc(uid).update(next);
  }

  async updateAvatar(uid: string, avatar: UserProfile["avatar"]): Promise<void> {
    await this.doc(uid).update({
      avatar,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  applyMatchStats(
    tx: Transaction,
    uid: string,
    current: UserProfile,
    delta: {
      win: boolean;
      result: {
        knockouts: number;
        deaths: number;
        damageDealt: number;
        damageTaken: number;
      };
      progression: UserProgression;
    },
  ): void {
    const stats: UserStats = {
      gamesPlayed: current.stats.gamesPlayed + 1,
      wins: current.stats.wins + (delta.win ? 1 : 0),
      losses: current.stats.losses + (delta.win ? 0 : 1),
      knockouts: current.stats.knockouts + delta.result.knockouts,
      deaths: current.stats.deaths + delta.result.deaths,
      damageDealt: current.stats.damageDealt + delta.result.damageDealt,
      damageTaken: current.stats.damageTaken + delta.result.damageTaken,
    };
    tx.update(this.doc(uid), {
      stats,
      progression: delta.progression,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export const usersRepository = new UsersRepository();
