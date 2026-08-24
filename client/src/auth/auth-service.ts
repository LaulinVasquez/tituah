import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import type { FighterColor, UserProfile } from "@tituah/shared";
import { usersRepository } from "../repositories/users.repository.js";
import { clientAuth } from "../services/firebase/firebaseClient.js";

export class AuthService {
  user: User | null = null;
  profile: UserProfile | null = null;
  private readonly listeners = new Set<() => void>();

  start(): void {
    onAuthStateChanged(clientAuth(), (user) => {
      this.user = user;
      if (!user) {
        this.profile = null;
        this.emit();
        return;
      }
      void this.refreshProfile().finally(() => this.emit());
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signIn(email: string, password: string): Promise<UserProfile> {
    await signInWithEmailAndPassword(clientAuth(), email, password);
    return this.ensureProfile();
  }

  async signUp(email: string, password: string, displayName: string): Promise<UserProfile> {
    await createUserWithEmailAndPassword(clientAuth(), email, password);
    return this.ensureProfile(displayName);
  }

  async playAsGuest(displayName?: string): Promise<UserProfile> {
    await signInAnonymously(clientAuth());
    return this.ensureProfile(displayName);
  }

  async signOut(): Promise<void> {
    await signOut(clientAuth());
    this.profile = null;
    this.emit();
  }

  async idToken(): Promise<string> {
    const user = clientAuth().currentUser;
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }

  async ensureProfile(displayName?: string): Promise<UserProfile> {
    const trimmed = displayName?.trim();
    this.profile = await usersRepository.ensure({
      displayName: trimmed || this.profile?.displayName,
    });
    if (trimmed && this.profile.displayName !== trimmed) {
      this.profile = (await usersRepository.updateSafe({ displayName: trimmed })) ?? this.profile;
    }
    this.emit();
    return this.profile;
  }

  async refreshProfile(): Promise<UserProfile | null> {
    const uid = clientAuth().currentUser?.uid;
    if (!uid) {
      this.profile = null;
      return null;
    }
    this.profile = (await usersRepository.get(uid)) ?? (await this.ensureProfile());
    return this.profile;
  }

  patchAvatar(avatar: UserProfile["avatar"]): void {
    if (!this.profile) return;
    this.profile = { ...this.profile, avatar: { ...avatar } };
  }

  patchProfile(partial: Partial<Pick<UserProfile, "displayName">>): void {
    if (!this.profile) return;
    this.profile = {
      ...this.profile,
      displayName: partial.displayName?.trim() || this.profile.displayName,
    };
  }

  async persistAvatarColor(color: FighterColor): Promise<UserProfile> {
    if (!this.profile) throw new Error("Not signed in");
    this.profile = {
      ...this.profile,
      avatar: { ...this.profile.avatar, baseAvatarId: color },
    };
    const saved = await usersRepository.updateSafe({ baseAvatarId: color });
    if (saved) this.profile = saved;
    return this.profile;
  }

  async saveFighter(data: { displayName?: string; baseAvatarId?: string }): Promise<UserProfile> {
    this.profile = (await usersRepository.updateSafe(data)) ?? this.profile;
    this.emit();
    if (!this.profile) throw new Error("Could not save fighter");
    return this.profile;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const authService = new AuthService();
