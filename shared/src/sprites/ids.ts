export const FIGHTER_SHEET_ID = "character-enhanced";

export type FighterColorId =
  | "base_01"
  | "orange"
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple";

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
] as const;
