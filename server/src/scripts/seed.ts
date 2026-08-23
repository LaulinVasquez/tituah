import {
  SPRITE_ASSET_IDS,
  type InventoryItem,
  type ItemRarity,
  type ItemSlot,
} from "@tituah/shared";
import { itemsRepository } from "../repositories/items.repository.js";
import { getFirebaseAdminApp } from "../services/firebase/firebaseAdmin.js";

interface SeedItem {
  id: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  assetId: string;
}

const SEED_ITEMS: SeedItem[] = [
  {
    id: SPRITE_ASSET_IDS.basicCap,
    name: "Basic Cap",
    description: "A simple starter cap.",
    slot: "head",
    rarity: "common",
    assetId: SPRITE_ASSET_IDS.basicCap,
  },
  {
    id: SPRITE_ASSET_IDS.cowboyHat,
    name: "Cowboy Hat",
    description: "A classic cowboy hat.",
    slot: "head",
    rarity: "common",
    assetId: SPRITE_ASSET_IDS.cowboyHat,
  },
  {
    id: SPRITE_ASSET_IDS.sunglasses,
    name: "Sunglasses",
    description: "Cool shades for the arena.",
    slot: "face",
    rarity: "common",
    assetId: SPRITE_ASSET_IDS.sunglasses,
  },
  {
    id: SPRITE_ASSET_IDS.goldChain,
    name: "Gold Chain",
    description: "A flashy gold chain.",
    slot: "body",
    rarity: "rare",
    assetId: SPRITE_ASSET_IDS.goldChain,
  },
  {
    id: SPRITE_ASSET_IDS.championshipBelt,
    name: "Championship Belt",
    description: "Proof you belong in the ring.",
    slot: "waist",
    rarity: "epic",
    assetId: SPRITE_ASSET_IDS.championshipBelt,
  },
  {
    id: SPRITE_ASSET_IDS.boxingGloveRed,
    name: "Boxing Glove",
    description: "A bright red boxing glove.",
    slot: "right_hand",
    rarity: "uncommon",
    assetId: SPRITE_ASSET_IDS.boxingGloveRed,
  },
  {
    id: SPRITE_ASSET_IDS.capeBlue,
    name: "Cape",
    description: "A flowing blue cape.",
    slot: "back",
    rarity: "rare",
    assetId: SPRITE_ASSET_IDS.capeBlue,
  },
  {
    id: SPRITE_ASSET_IDS.sneakers,
    name: "Sneakers",
    description: "Light sneakers for quick movement.",
    slot: "feet",
    rarity: "common",
    assetId: SPRITE_ASSET_IDS.sneakers,
  },
  {
    id: SPRITE_ASSET_IDS.sparkEffect,
    name: "Spark Effect",
    description: "A crackle of sparks around the fighter.",
    slot: "effect",
    rarity: "uncommon",
    assetId: SPRITE_ASSET_IDS.sparkEffect,
  },
];

async function seed(): Promise<void> {
  getFirebaseAdminApp();
  for (const item of SEED_ITEMS) {
    const payload: Omit<InventoryItem, "createdAt" | "updatedAt"> = {
      ...item,
      enabled: true,
    };
    await itemsRepository.upsert(payload);
    console.log(`Seeded ${item.id}`);
  }
  console.log(`Seeded ${SEED_ITEMS.length} catalog items.`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
