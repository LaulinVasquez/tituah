import type { StageId } from "@tituah/shared";
import { resolveAssetUrl } from "../../config/runtime.js";

export interface StageVisualConfig {
  id: StageId;
  name: string;
  background: string;
  focusX: number;
  void: number;
  platformTop: number;
  platformBody: number;
  platformEdge: number;
  platformShadow: number;
  particle: number;
}

export const STAGE_VISUALS: Record<StageId, StageVisualConfig> = {
  barnyard: {
    id: "barnyard", name: "Barnyard Brawl",
    background: resolveAssetUrl("/assets/stages/backgrounds/barnyard-brawl.png"), focusX: 0.52,
    void: 0x241629, platformTop: 0xe2ad55, platformBody: 0x74482f,
    platformEdge: 0x3b271f, platformShadow: 0x120c10, particle: 0xffd37a,
  },
  fridge: {
    id: "fridge", name: "Fridge Frenzy",
    background: resolveAssetUrl("/assets/stages/backgrounds/fridge-frenzy.png"), focusX: 0.5,
    void: 0x071521, platformTop: 0xc8f4ff, platformBody: 0x5286a7,
    platformEdge: 0x244b68, platformShadow: 0x06101c, particle: 0xdffaff,
  },
  meadow: {
    id: "meadow", name: "Sky-High Meadow",
    background: resolveAssetUrl("/assets/stages/backgrounds/sky-high-meadow.png"), focusX: 0.54,
    void: 0x4778ad, platformTop: 0xa8dc68, platformBody: 0x56764c,
    platformEdge: 0x304638, platformShadow: 0x172b35, particle: 0xe9ffb0,
  },
};

export const STAGE_BACKGROUND_URLS = Object.values(STAGE_VISUALS).map((stage) => stage.background);
