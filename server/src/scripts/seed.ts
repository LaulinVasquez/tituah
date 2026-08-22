import {
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
    id: "basic_cap_01",
    name: "Basic Cap",
    description: "A simple starter cap.",
    slot: "head",
    rarity: "common",
    assetId: "basic_cap_01",
  },
  {
    id: "cowboy_hat_01",
    name: "Cowboy Hat",
    description: "A classic cowboy hat.",
    slot: "head",
    rarity: "common",
    assetId: "cowboy_hat_01",
  },
  {
    id: "sunglasses_01",
    name: "Sunglasses",
    description: "Cool shades for the arena.",
    slot: "face",
    rarity: "common",
    assetId: "sunglasses_01",
  },
  {
    id: "gold_chain_01",
    name: "Gold Chain",
    description: "A flashy gold chain.",
    slot: "body",
    rarity: "rare",
    assetId: "gold_chain_01",
  },
  {
    id: "championship_belt_01",
    name: "Championship Belt",
    description: "Proof you belong in the ring.",
    slot: "waist",
    rarity: "epic",
    assetId: "championship_belt_01",
  },
  {
    id: "boxing_glove_red",
    name: "Boxing Glove",
    description: "A bright red boxing glove.",
    slot: "right_hand",
    rarity: "uncommon",
    assetId: "boxing_glove_red",
  },
  {
    id: "cape_blue_01",
    name: "Cape",
    description: "A flowing blue cape.",
    slot: "back",
    rarity: "rare",
    assetId: "cape_blue_01",
  },
  {
    id: "sneakers_01",
    name: "Sneakers",
    description: "Light sneakers for quick movement.",
    slot: "feet",
    rarity: "common",
    assetId: "sneakers_01",
  },
  {
    id: "spark_effect_01",
    name: "Spark Effect",
    description: "A crackle of sparks around the fighter.",
    slot: "effect",
    rarity: "uncommon",
    assetId: "spark_effect_01",
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
