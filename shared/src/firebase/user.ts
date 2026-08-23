export type UserRole = "user" | "admin";

export interface UserProgression {
  level: number;
  xp: number;
}

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  knockouts: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface AvatarConfiguration {
  baseAvatarId: string;
  headAccessoryId: string | null;
  faceAccessoryId: string | null;
  bodyAccessoryId: string | null;
  waistAccessoryId: string | null;
  backAccessoryId: string | null;
  leftHandAccessoryId: string | null;
  rightHandAccessoryId: string | null;
  feetAccessoryId: string | null;
  effectAccessoryId: string | null;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  createdAt: unknown;
  updatedAt: unknown;
  progression: UserProgression;
  stats: UserStats;
  avatar: AvatarConfiguration;
  role: UserRole;
}

export const DEFAULT_PROGRESSION: UserProgression = {
  level: 1,
  xp: 0,
};

export const DEFAULT_STATS: UserStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  knockouts: 0,
  deaths: 0,
  damageDealt: 0,
  damageTaken: 0,
};

export const DEFAULT_AVATAR: AvatarConfiguration = {
  baseAvatarId: "base_01",
  headAccessoryId: null,
  faceAccessoryId: null,
  bodyAccessoryId: null,
  waistAccessoryId: null,
  backAccessoryId: null,
  leftHandAccessoryId: null,
  rightHandAccessoryId: null,
  feetAccessoryId: null,
  effectAccessoryId: null,
};

export function emptyAvatar(baseAvatarId = "base_01"): AvatarConfiguration {
  return { ...DEFAULT_AVATAR, baseAvatarId };
}

export function defaultUserProfile(
  uid: string,
  data: { username?: string; displayName?: string },
): Omit<UserProfile, "createdAt" | "updatedAt"> {
  const displayName = data.displayName?.trim() || data.username?.trim() || "Fighter";
  const username = data.username?.trim() || slugifyName(displayName);
  return {
    uid,
    username,
    displayName,
    progression: { ...DEFAULT_PROGRESSION },
    stats: { ...DEFAULT_STATS },
    avatar: emptyAvatar(),
    role: "user",
  };
}

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
  return slug || "fighter";
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 100);
}
