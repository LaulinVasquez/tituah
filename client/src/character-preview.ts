import {
  SLOT_TO_AVATAR_FIELD,
  type AvatarConfiguration,
  type InventoryItem,
  type ItemSlot,
} from "@tituah/shared";

export function applyAvatarLook(
  root: HTMLElement,
  avatar: AvatarConfiguration | null,
  items: InventoryItem[] = [],
): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const slotEl of root.querySelectorAll<HTMLElement>("[data-slot]")) {
    const slot = slotEl.dataset.slot as ItemSlot | undefined;
    if (!slot || !(slot in SLOT_TO_AVATAR_FIELD)) continue;
    const itemId = avatar?.[SLOT_TO_AVATAR_FIELD[slot]];
    if (typeof itemId !== "string" || !itemId) {
      slotEl.dataset.asset = "";
      continue;
    }
    slotEl.dataset.asset = byId.get(itemId)?.assetId ?? itemId;
  }
}
