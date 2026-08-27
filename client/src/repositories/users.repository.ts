import { doc, getDoc } from "firebase/firestore";
import type { UserProfile } from "@tituah/shared";
import { apiRequest } from "../services/api.js";
import { clientDb } from "../services/firebase/firebaseClient.js";

export class UsersRepository {
  async get(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(clientDb(), "users", uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  }

  async ensure(data: { displayName?: string; username?: string } = {}): Promise<UserProfile> {
    const result = await apiRequest<{ profile: UserProfile }>("/api/session/ensure", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result.profile;
  }

  async updateSafe(data: {
    displayName?: string;
    username?: string;
    baseAvatarId?: string;
    throwableId?: string;
    faceAccessoryId?: string | null;
  }): Promise<UserProfile | null> {
    const result = await apiRequest<{ profile: UserProfile }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return result.profile;
  }
}

export const usersRepository = new UsersRepository();
