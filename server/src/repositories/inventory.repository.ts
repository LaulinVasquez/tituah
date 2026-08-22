import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import type { InventorySource, UserInventoryItem } from "@tituah/shared";
import { adminDb } from "../services/firebase/firebaseAdmin.js";

export class InventoryRepository {
  col(uid: string) {
    return adminDb().collection("users").doc(uid).collection("inventory");
  }

  doc(uid: string, itemId: string): DocumentReference {
    return this.col(uid).doc(itemId);
  }

  async get(uid: string, itemId: string): Promise<UserInventoryItem | null> {
    const snap = await this.doc(uid, itemId).get();
    return snap.exists ? (snap.data() as UserInventoryItem) : null;
  }

  async list(uid: string): Promise<UserInventoryItem[]> {
    const snap = await this.col(uid).get();
    return snap.docs.map((doc) => doc.data() as UserInventoryItem);
  }

  async grant(
    uid: string,
    itemId: string,
    source: InventorySource,
    quantity = 1,
  ): Promise<UserInventoryItem> {
    const existing = await this.get(uid, itemId);
    if (existing) {
      await this.doc(uid, itemId).update({
        quantity: existing.quantity + quantity,
      });
      return { ...existing, quantity: existing.quantity + quantity };
    }
    const payload: UserInventoryItem = {
      itemId,
      acquiredAt: FieldValue.serverTimestamp(),
      source,
      quantity,
    };
    await this.doc(uid, itemId).set(payload);
    return payload;
  }

  async remove(uid: string, itemId: string): Promise<void> {
    await this.doc(uid, itemId).delete();
  }
}

export const inventoryRepository = new InventoryRepository();
