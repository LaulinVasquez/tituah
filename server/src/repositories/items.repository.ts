import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import type { InventoryItem } from "@tituah/shared";
import { adminDb } from "../services/firebase/firebaseAdmin.js";

export type CatalogItemInput = Omit<InventoryItem, "createdAt" | "updatedAt">;
export type CatalogItemUpdates = Partial<Omit<InventoryItem, "id" | "createdAt">>;

export class ItemsRepository {
  private col() {
    return adminDb().collection("items");
  }

  doc(itemId: string): DocumentReference {
    return this.col().doc(itemId);
  }

  async get(itemId: string): Promise<InventoryItem | null> {
    const snap = await this.doc(itemId).get();
    return snap.exists ? (snap.data() as InventoryItem) : null;
  }

  async listEnabled(): Promise<InventoryItem[]> {
    const snap = await this.col().where("enabled", "==", true).get();
    return snap.docs.map((doc) => doc.data() as InventoryItem);
  }

  async listAll(): Promise<InventoryItem[]> {
    const snap = await this.col().get();
    return snap.docs.map((doc) => doc.data() as InventoryItem);
  }

  async create(item: CatalogItemInput): Promise<InventoryItem> {
    const payload = {
      ...item,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await this.doc(item.id).set(payload);
    const created = await this.get(item.id);
    if (!created) throw new Error(`Failed to create item ${item.id}`);
    return created;
  }

  async update(itemId: string, updates: CatalogItemUpdates): Promise<void> {
    await this.doc(itemId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async upsert(item: CatalogItemInput): Promise<void> {
    const existing = await this.get(item.id);
    if (existing) {
      await this.update(item.id, {
        name: item.name,
        description: item.description,
        slot: item.slot,
        rarity: item.rarity,
        assetId: item.assetId,
        enabled: item.enabled,
      });
      return;
    }
    await this.create(item);
  }
}

export const itemsRepository = new ItemsRepository();
