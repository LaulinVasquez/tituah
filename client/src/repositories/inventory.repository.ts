import { collection, getDocs } from "firebase/firestore";
import type { UserInventoryItem } from "@tituah/shared";
import { apiRequest } from "../services/api.js";
import { clientDb } from "../services/firebase/firebaseClient.js";

export class InventoryRepository {
  async list(uid: string): Promise<UserInventoryItem[]> {
    const snap = await getDocs(collection(clientDb(), "users", uid, "inventory"));
    return snap.docs.map((item) => item.data() as UserInventoryItem);
  }

  async equip(itemId: string): Promise<void> {
    await apiRequest("/api/avatar/equip", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
  }

  async unequip(slot: string): Promise<void> {
    await apiRequest("/api/avatar/unequip", {
      method: "POST",
      body: JSON.stringify({ slot }),
    });
  }
}

export const inventoryRepository = new InventoryRepository();
