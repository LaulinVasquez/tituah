export const FIGHTER_SHEET_ID = "character-enhanced";

export const FIGHTER_COLORS = ["orange", "red", "blue", "green", "yellow", "purple"] as const;

export type FighterColor = (typeof FIGHTER_COLORS)[number];

export type FighterColorId = "base_01" | FighterColor;

export const FIGHTER_COLOR_HEX: Record<FighterColor, string> = {
  orange: "#ff7a45",
  red: "#e4453a",
  blue: "#5b9dff",
  green: "#3ecf8e",
  yellow: "#e8c44a",
  purple: "#a56bff",
};

export function isFighterColor(value: string | null | undefined): value is FighterColor {
  return value != null && (FIGHTER_COLORS as readonly string[]).includes(value);
}

export function fighterColorFromId(id: string | null | undefined): FighterColor {
  return isFighterColor(id) ? id : "orange";
}

export const THROWABLE_IDS = ["sandal", "stick", "pan", "bat"] as const;

export type ThrowableId = (typeof THROWABLE_IDS)[number];

export const THROWABLE_LABELS: Record<ThrowableId, string> = {
  sandal: "Sandal",
  stick: "Stick",
  pan: "Pan",
  bat: "Bat",
};

export function isThrowableId(value: string | null | undefined): value is ThrowableId {
  return value != null && (THROWABLE_IDS as readonly string[]).includes(value);
}

export function throwableIdFromAvatar(id: string | null | undefined): ThrowableId {
  return isThrowableId(id) ? id : "sandal";
}

export const SPRITE_ASSET_IDS = {
  basicCap: "basic_cap_01",
  cowboyHat: "cowboy_hat_01",
  sunglasses: "sunglasses_01",
  goldChain: "gold_chain_01",
  championshipBelt: "championship_belt_01",
  boxingGloveRed: "boxing_glove_red",
  capeBlue: "cape_blue_01",
  sneakers: "sneakers_01",
  sparkEffect: "spark_effect_01",
  crown: "crown_01",
  redBandana: "red_bandana_01",
  blueBandana: "blue_bandana_01",
  topHat: "top_hat_01",
} as const;

export const SHEET_ACCESSORY_IDS = [
  SPRITE_ASSET_IDS.sunglasses,
  SPRITE_ASSET_IDS.basicCap,
  SPRITE_ASSET_IDS.goldChain,
  SPRITE_ASSET_IDS.crown,
  SPRITE_ASSET_IDS.redBandana,
  SPRITE_ASSET_IDS.blueBandana,
  SPRITE_ASSET_IDS.topHat,
  SPRITE_ASSET_IDS.sneakers,
] as const;
