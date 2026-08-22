import type { AvatarConfiguration } from "./user.js";

export type ItemSlot =
  | "head"
  | "face"
  | "body"
  | "waist"
  | "back"
  | "left_hand"
  | "right_hand"
  | "feet"
  | "effect";

export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type InventorySource = "default" | "reward" | "purchase" | "admin" | "achievement";

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  assetId: string;
  enabled: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface UserInventoryItem {
  itemId: string;
  acquiredAt: unknown;
  source: InventorySource;
  quantity: number;
}

export const SLOT_TO_AVATAR_FIELD: Record<ItemSlot, keyof AvatarConfiguration> = {
  head: "headAccessoryId",
  face: "faceAccessoryId",
  body: "bodyAccessoryId",
  waist: "waistAccessoryId",
  back: "backAccessoryId",
  left_hand: "leftHandAccessoryId",
  right_hand: "rightHandAccessoryId",
  feet: "feetAccessoryId",
  effect: "effectAccessoryId",
};

export const AVATAR_FIELD_TO_SLOT: Partial<Record<keyof AvatarConfiguration, ItemSlot>> = {
  headAccessoryId: "head",
  faceAccessoryId: "face",
  bodyAccessoryId: "body",
  waistAccessoryId: "waist",
  backAccessoryId: "back",
  leftHandAccessoryId: "left_hand",
  rightHandAccessoryId: "right_hand",
  feetAccessoryId: "feet",
  effectAccessoryId: "effect",
};

export const DEFAULT_STARTER_ITEM_IDS = [
  "basic_cap_01",
  "sunglasses_01",
  "sneakers_01",
] as const;
