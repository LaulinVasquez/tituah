import { collection, getDocs, query, where } from "firebase/firestore";
import type { InventoryItem } from "@tituah/shared";
import { clientDb } from "../services/firebase/firebaseClient.js";

export class ItemsRepository {
  async listEnabled(): Promise<InventoryItem[]> {
    const snap = await getDocs(
      query(collection(clientDb(), "items"), where("enabled", "==", true)),
    );
    return snap.docs.map((item) => item.data() as InventoryItem);
  }
}

export const itemsRepository = new ItemsRepository();
