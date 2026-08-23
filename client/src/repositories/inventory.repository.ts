import { collection, getDocs } from "firebase/firestore";
import type { AvatarConfiguration, UserInventoryItem } from "@tituah/shared";
import { apiRequest } from "../services/api.js";
import { clientDb } from "../services/firebase/firebaseClient.js";

export class InventoryRepository {
  async list(uid: string): Promise<UserInventoryItem[]> {
    const snap = await getDocs(collection(clientDb(), "users", uid, "inventory"));
    return snap.docs.map((item) => item.data() as UserInventoryItem);
  }

  async equip(itemId: string): Promise<AvatarConfiguration> {
    const { avatar } = await apiRequest<{ avatar: AvatarConfiguration }>("/api/avatar/equip", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return avatar;
  }

  async unequip(slot: string): Promise<AvatarConfiguration> {
    const { avatar } = await apiRequest<{ avatar: AvatarConfiguration }>("/api/avatar/unequip", {
      method: "POST",
      body: JSON.stringify({ slot }),
    });
    return avatar;
  }
}

export const inventoryRepository = new InventoryRepository();
