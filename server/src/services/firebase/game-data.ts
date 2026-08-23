import {
  AVATAR_FIELD_TO_SLOT,
  DEFAULT_STARTER_ITEM_IDS,
  SLOT_TO_AVATAR_FIELD,
  XP_LOSS,
  XP_PER_KO,
  XP_WIN,
  emptyAvatar,
  levelFromXp,
  type InventoryItem,
  type InventorySource,
  type ItemSlot,
  type MatchPlayerResult,
  type MatchRecord,
  type UserInventoryItem,
  type UserProfile,
} from "@tituah/shared";
import { adminDb } from "./firebaseAdmin.js";
import { inventoryRepository } from "../../repositories/inventory.repository.js";
import {
  itemsRepository,
  type CatalogItemInput,
  type CatalogItemUpdates,
} from "../../repositories/items.repository.js";
import { matchesRepository } from "../../repositories/matches.repository.js";
import { usersRepository } from "../../repositories/users.repository.js";

export async function createUserProfile(
  uid: string,
  data: { username?: string; displayName?: string },
): Promise<UserProfile> {
  const existing = await usersRepository.get(uid);
  if (existing) return existing;
  const profile = await usersRepository.create(uid, data);
  await grantDefaultItems(uid);
  return (await usersRepository.get(uid)) ?? profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  return usersRepository.get(uid);
}

export async function grantItemToUser(
  uid: string,
  itemId: string,
  source: InventorySource,
  quantity = 1,
): Promise<UserInventoryItem> {
  const item = await itemsRepository.get(itemId);
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  if (!item.enabled && source !== "admin") {
    throw new Error(`Item is disabled: ${itemId}`);
  }
  return inventoryRepository.grant(uid, itemId, source, quantity);
}

export async function removeItemFromUser(uid: string, itemId: string): Promise<void> {
  const profile = await usersRepository.get(uid);
  if (profile) {
    const next = { ...profile.avatar };
    for (const [field, slotItemId] of Object.entries(next)) {
      if (slotItemId === itemId) {
        (next as Record<string, unknown>)[field] = field === "baseAvatarId" ? "base_01" : null;
      }
    }
    await usersRepository.updateAvatar(uid, next);
  }
  await inventoryRepository.remove(uid, itemId);
}

export async function equipItem(uid: string, itemId: string): Promise<UserProfile["avatar"]> {
  const [profile, owned, item] = await Promise.all([
    usersRepository.get(uid),
    inventoryRepository.get(uid, itemId),
    itemsRepository.get(itemId),
  ]);
  if (!profile) throw new Error("User profile not found");
  if (!item || !item.enabled) throw new Error("Item does not exist");
  if (!owned) throw new Error("Player does not own this item");

  const field = SLOT_TO_AVATAR_FIELD[item.slot];
  const avatar = { ...profile.avatar, [field]: item.id };
  await usersRepository.updateAvatar(uid, avatar);
  return avatar;
}

export async function unequipItem(uid: string, slot: ItemSlot): Promise<UserProfile["avatar"]> {
  const profile = await usersRepository.get(uid);
  if (!profile) throw new Error("User profile not found");
  const field = SLOT_TO_AVATAR_FIELD[slot];
  const avatar = { ...profile.avatar, [field]: null };
  await usersRepository.updateAvatar(uid, avatar);
  return avatar;
}

export async function createCatalogItem(item: CatalogItemInput): Promise<InventoryItem> {
  return itemsRepository.create(item);
}

export async function updateCatalogItem(
  itemId: string,
  updates: CatalogItemUpdates,
): Promise<void> {
  await itemsRepository.update(itemId, updates);
}

export async function recordMatchResult(match: MatchRecord): Promise<void> {
  await applyMatchRewards(match);
}

export async function applyMatchRewards(match: MatchRecord): Promise<void> {
  const playerIds = match.players;
  await adminDb().runTransaction(async (tx) => {
    const profiles = new Map<string, UserProfile>();
    for (const uid of playerIds) {
      const snap = await tx.get(usersRepository.doc(uid));
      if (snap.exists) {
        profiles.set(uid, snap.data() as UserProfile);
      }
    }

    matchesRepository.writeCompleted(tx, {
      ...match,
      status: "completed",
    });

    for (const uid of playerIds) {
      const profile = profiles.get(uid);
      if (!profile) continue;
      const result = match.results[uid] ?? emptyResult();
      const won = match.winnerId === uid;
      const xpGain = (won ? XP_WIN : XP_LOSS) + result.knockouts * XP_PER_KO;
      const xp = profile.progression.xp + xpGain;
      usersRepository.applyMatchStats(tx, uid, profile, {
        win: won,
        result,
        progression: {
          xp,
          level: levelFromXp(xp),
        },
      });
    }
  });
}

export async function listOwnedCatalog(
  uid: string,
): Promise<Array<UserInventoryItem & { item: InventoryItem | null }>> {
  const owned = await inventoryRepository.list(uid);
  return Promise.all(
    owned.map(async (entry) => ({
      ...entry,
      item: await itemsRepository.get(entry.itemId),
    })),
  );
}

export function avatarFieldForItem(item: InventoryItem): keyof UserProfile["avatar"] {
  return SLOT_TO_AVATAR_FIELD[item.slot];
}

export function slotForAvatarField(field: keyof UserProfile["avatar"]): ItemSlot | undefined {
  return AVATAR_FIELD_TO_SLOT[field];
}

export function resetAvatar(): UserProfile["avatar"] {
  return emptyAvatar();
}

async function grantDefaultItems(uid: string): Promise<void> {
  for (const itemId of DEFAULT_STARTER_ITEM_IDS) {
    const item = await itemsRepository.get(itemId);
    if (!item) continue;
    await inventoryRepository.grant(uid, itemId, "default", 1);
  }
}

function emptyResult(): MatchPlayerResult {
  return {
    knockouts: 0,
    deaths: 0,
    damageDealt: 0,
    damageTaken: 0,
  };
}
