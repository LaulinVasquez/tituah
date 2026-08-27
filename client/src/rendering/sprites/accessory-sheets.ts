import { resolveAssetUrl } from "../../config/runtime.js";
import { SPRITE_ASSET_IDS, type AvatarConfiguration } from "@tituah/shared";
import { FIGHTER_ANIMATIONS, type FighterAnimation, type FighterFrame } from "./fighter-atlas.js";

export type BakedAccessorySlot = "head" | "face" | "body";

export interface BakedAccessoryDefinition {
  id: string;
  label: string;
  slot: BakedAccessorySlot;
  /** Avatar field that stores this accessory id when equipped. */
  field: "headAccessoryId" | "faceAccessoryId" | "bodyAccessoryId";
  url: string;
  /** Dedicated run / run-slap / throw sheet (uneven pose spacing). */
  movesUrl?: string;
  frames: Partial<Record<FighterAnimation, readonly FighterFrame[]>>;
}

const SUNGLASSES_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 30, y: 82, width: 127, height: 124 },
      { x: 172, y: 80, width: 126, height: 125 },
      { x: 313, y: 78, width: 128, height: 125 },
      { x: 471, y: 77, width: 130, height: 126 },
    ],
    run: [
      { x: 116, y: 126, width: 194, height: 164 },
      { x: 349, y: 126, width: 184, height: 165 },
      { x: 579, y: 126, width: 189, height: 167 },
      { x: 805, y: 126, width: 193, height: 167 },
      { x: 100, y: 338, width: 209, height: 157 },
      { x: 341, y: 338, width: 198, height: 164 },
      { x: 561, y: 336, width: 217, height: 163 },
      { x: 802, y: 336, width: 206, height: 167 },
    ],
    jump: [
      { x: 30, y: 280, width: 130, height: 153 },
      { x: 189, y: 272, width: 137, height: 165 },
      { x: 361, y: 288, width: 146, height: 135 },
    ],
    fall: [
      { x: 549, y: 301, width: 135, height: 132 },
      { x: 734, y: 311, width: 130, height: 122 },
      { x: 896, y: 306, width: 126, height: 131 },
    ],
    land: [
      { x: 1054, y: 315, width: 134, height: 124 },
      { x: 1207, y: 317, width: 130, height: 122 },
      { x: 1351, y: 317, width: 129, height: 123 },
      { x: 1503, y: 322, width: 131, height: 118 },
    ],
    slapCharge: [
      { x: 34, y: 502, width: 135, height: 124 },
      { x: 194, y: 505, width: 134, height: 123 },
      { x: 346, y: 503, width: 165, height: 126 },
    ],
    slapAttack: [
      { x: 546, y: 503, width: 165, height: 123 },
      { x: 727, y: 486, width: 381, height: 148, offsetX: 77 },
    ],
    slapRecovery: [
      { x: 1155, y: 507, width: 141, height: 122 },
      { x: 1318, y: 511, width: 159, height: 119 },
      { x: 1487, y: 511, width: 140, height: 119 },
    ],
    runSlapCombo: [
      { x: 98, y: 750, width: 117, height: 109, offsetX: -3 },
      { x: 232, y: 744, width: 184, height: 116, offsetX: -29 },
      { x: 416, y: 750, width: 113, height: 110, offsetX: -1 },
      { x: 529, y: 747, width: 186, height: 116, offsetX: -13 },
      { x: 715, y: 749, width: 126, height: 111, offsetX: -7 },
      { x: 844, y: 744, width: 176, height: 116, offsetX: -11 },
    ],
    throw: [
      { x: 111, y: 1117, width: 228, height: 188, offsetX: -10 },
      { x: 432, y: 1112, width: 214, height: 192, offsetX: -6 },
      { x: 776, y: 1117, width: 230, height: 188 },
    ],
    hit: [
      { x: 26, y: 705, width: 141, height: 135 },
      { x: 210, y: 697, width: 125, height: 147 },
      { x: 376, y: 697, width: 111, height: 147 },
    ],
    ko: [
      { x: 521, y: 732, width: 98, height: 104 },
      { x: 630, y: 740, width: 153, height: 97 },
      { x: 820, y: 760, width: 145, height: 81 },
    ],
};

const CROWN_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 54, y: 66, width: 121, height: 167 },
      { x: 189, y: 66, width: 118, height: 166 },
      { x: 331, y: 71, width: 122, height: 161 },
      { x: 488, y: 69, width: 121, height: 163 },
    ],
    run: [
      { x: 100, y: 66, width: 182, height: 206 },
      { x: 334, y: 70, width: 176, height: 205 },
      { x: 572, y: 69, width: 177, height: 206 },
      { x: 825, y: 74, width: 182, height: 201 },
      { x: 79, y: 346, width: 208, height: 208 },
      { x: 332, y: 355, width: 193, height: 205 },
      { x: 556, y: 346, width: 215, height: 212 },
      { x: 797, y: 350, width: 203, height: 211 },
    ],
    jump: [
      { x: 38, y: 287, width: 124, height: 162 },
      { x: 182, y: 288, width: 130, height: 167 },
      { x: 346, y: 287, width: 140, height: 161 },
    ],
    fall: [
      { x: 546, y: 292, width: 129, height: 161 },
      { x: 700, y: 312, width: 123, height: 156 },
      { x: 844, y: 320, width: 124, height: 150 },
    ],
    land: [
      { x: 1010, y: 310, width: 125, height: 162 },
      { x: 1159, y: 311, width: 123, height: 162 },
      { x: 1296, y: 320, width: 235, height: 157 },
    ],
    slapCharge: [
      { x: 24, y: 540, width: 135, height: 151 },
      { x: 183, y: 549, width: 136, height: 134 },
      { x: 328, y: 541, width: 165, height: 152 },
    ],
    slapAttack: [
      { x: 524, y: 537, width: 161, height: 156 },
      { x: 688, y: 537, width: 372, height: 160, offsetX: 74 },
    ],
    slapRecovery: [
      { x: 1091, y: 539, width: 142, height: 154 },
      { x: 1253, y: 538, width: 157, height: 159 },
      { x: 1403, y: 544, width: 132, height: 153 },
    ],
    runSlapCombo: [
      { x: 72, y: 760, width: 117, height: 155, offsetX: -5 },
      { x: 231, y: 758, width: 179, height: 158, offsetX: -22 },
      { x: 410, y: 765, width: 113, height: 152, offsetX: -2 },
      { x: 528, y: 766, width: 194, height: 154, offsetX: -16 },
      { x: 734, y: 762, width: 117, height: 154, offsetX: -8 },
      { x: 862, y: 766, width: 164, height: 151, offsetX: -10 },
    ],
    throw: [
      { x: 95, y: 1075, width: 217, height: 224, offsetX: -8 },
      { x: 423, y: 1075, width: 208, height: 223, offsetX: -3 },
      { x: 760, y: 1101, width: 213, height: 200, offsetX: 7 },
    ],
    hit: [
      { x: 37, y: 756, width: 132, height: 150 },
      { x: 196, y: 757, width: 117, height: 149 },
      { x: 351, y: 761, width: 110, height: 143 },
    ],
    ko: [
      { x: 598, y: 785, width: 145, height: 117 },
      { x: 776, y: 786, width: 152, height: 117 },
      { x: 973, y: 779, width: 149, height: 125 },
    ],
};

const REDBANDANA_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 41, y: 54, width: 143, height: 144 },
      { x: 196, y: 55, width: 144, height: 142 },
      { x: 364, y: 57, width: 140, height: 140 },
      { x: 543, y: 60, width: 139, height: 136 },
    ],
    run: [
      { x: 108, y: 93, width: 192, height: 170 },
      { x: 342, y: 95, width: 191, height: 170 },
      { x: 582, y: 94, width: 188, height: 172 },
      { x: 807, y: 98, width: 191, height: 167 },
      { x: 87, y: 285, width: 215, height: 161 },
      { x: 336, y: 286, width: 203, height: 171 },
      { x: 562, y: 287, width: 220, height: 167 },
      { x: 806, y: 289, width: 206, height: 167 },
    ],
    jump: [
      { x: 36, y: 265, width: 150, height: 157 },
      { x: 198, y: 266, width: 156, height: 159 },
      { x: 381, y: 276, width: 162, height: 152 },
    ],
    fall: [
      { x: 609, y: 281, width: 158, height: 145 },
      { x: 805, y: 296, width: 139, height: 134 },
      { x: 1000, y: 296, width: 144, height: 134 },
    ],
    land: [
      { x: 1187, y: 292, width: 165, height: 136 },
      { x: 1372, y: 298, width: 165, height: 130 },
      { x: 1555, y: 301, width: 169, height: 128 },
    ],
    slapCharge: [
      { x: 48, y: 477, width: 147, height: 143 },
      { x: 215, y: 488, width: 142, height: 134 },
      { x: 373, y: 484, width: 181, height: 138 },
    ],
    slapAttack: [
      { x: 584, y: 484, width: 172, height: 136 },
      { x: 781, y: 476, width: 383, height: 151, offsetX: 78 },
    ],
    slapRecovery: [
      { x: 1193, y: 489, width: 161, height: 137 },
      { x: 1364, y: 488, width: 187, height: 139 },
      { x: 1552, y: 492, width: 179, height: 134 },
    ],
    runSlapCombo: [
      { x: 110, y: 697, width: 118, height: 111, offsetX: -3 },
      { x: 242, y: 695, width: 179, height: 114, offsetX: -26 },
      { x: 421, y: 698, width: 110, height: 112, offsetX: 1 },
      { x: 531, y: 697, width: 182, height: 114, offsetX: -15 },
      { x: 713, y: 697, width: 119, height: 112, offsetX: -9 },
      { x: 834, y: 695, width: 169, height: 113, offsetX: -13 },
    ],
    throw: [
      { x: 108, y: 1084, width: 227, height: 195, offsetX: -13 },
      { x: 430, y: 1079, width: 215, height: 199, offsetX: -6 },
      { x: 777, y: 1093, width: 229, height: 186 },
    ],
    hit: [
      { x: 35, y: 685, width: 152, height: 137 },
      { x: 211, y: 674, width: 134, height: 149 },
      { x: 373, y: 674, width: 121, height: 147 },
    ],
    ko: [
      { x: 622, y: 708, width: 165, height: 104 },
      { x: 807, y: 704, width: 215, height: 115 },
      { x: 1022, y: 676, width: 160, height: 142 },
    ],
};

const BASICCAP_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 62, y: 70, width: 132, height: 141 },
      { x: 216, y: 72, width: 131, height: 139 },
      { x: 367, y: 70, width: 128, height: 140 },
      { x: 529, y: 70, width: 136, height: 139 },
    ],
    run: [
      { x: 93, y: 83, width: 189, height: 176 },
      { x: 329, y: 83, width: 193, height: 178 },
      { x: 574, y: 83, width: 187, height: 179 },
      { x: 800, y: 88, width: 188, height: 172 },
      { x: 74, y: 305, width: 210, height: 169 },
      { x: 322, y: 303, width: 201, height: 175 },
      { x: 552, y: 303, width: 213, height: 174 },
      { x: 795, y: 303, width: 199, height: 173 },
    ],
    jump: [
      { x: 62, y: 271, width: 132, height: 155 },
      { x: 218, y: 274, width: 147, height: 156 },
      { x: 391, y: 284, width: 150, height: 147 },
    ],
    fall: [
      { x: 579, y: 290, width: 139, height: 141 },
      { x: 749, y: 304, width: 134, height: 124 },
      { x: 909, y: 301, width: 131, height: 131 },
    ],
    land: [
      { x: 1071, y: 288, width: 152, height: 140 },
      { x: 1231, y: 311, width: 146, height: 119 },
      { x: 1377, y: 312, width: 293, height: 120 },
    ],
    slapCharge: [
      { x: 62, y: 484, width: 135, height: 138 },
      { x: 224, y: 497, width: 135, height: 125 },
      { x: 375, y: 490, width: 164, height: 132 },
    ],
    slapAttack: [
      { x: 575, y: 492, width: 163, height: 129 },
      { x: 748, y: 473, width: 379, height: 158, offsetX: 77 },
    ],
    slapRecovery: [
      { x: 1172, y: 490, width: 149, height: 131 },
      { x: 1328, y: 490, width: 175, height: 130 },
      { x: 1503, y: 492, width: 159, height: 128 },
    ],
    runSlapCombo: [
      { x: 99, y: 686, width: 115, height: 115, offsetX: -1 },
      { x: 233, y: 687, width: 173, height: 115, offsetX: -21 },
      { x: 406, y: 689, width: 111, height: 115 },
      { x: 523, y: 689, width: 182, height: 116, offsetX: -15 },
      { x: 705, y: 693, width: 117, height: 111, offsetX: -7 },
      { x: 832, y: 689, width: 172, height: 115, offsetX: -15 },
    ],
    throw: [
      { x: 89, y: 1067, width: 230, height: 195, offsetX: -5 },
      { x: 416, y: 1060, width: 210, height: 203, offsetX: -6 },
      { x: 754, y: 1069, width: 234, height: 195, offsetX: -9 },
    ],
    hit: [
      { x: 56, y: 695, width: 141, height: 139 },
      { x: 220, y: 693, width: 122, height: 141 },
      { x: 373, y: 693, width: 109, height: 136 },
    ],
    ko: [
      { x: 538, y: 713, width: 97, height: 109 },
      { x: 673, y: 728, width: 152, height: 94 },
      { x: 854, y: 720, width: 158, height: 110 },
    ],
};

const BLUEBANDANA_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 38, y: 123, width: 130, height: 129 },
      { x: 185, y: 124, width: 129, height: 128 },
      { x: 342, y: 123, width: 130, height: 129 },
      { x: 499, y: 123, width: 130, height: 127 },
    ],
    run: [
      { x: 105, y: 107, width: 190, height: 167 },
      { x: 340, y: 112, width: 183, height: 164 },
      { x: 574, y: 107, width: 187, height: 170 },
      { x: 803, y: 111, width: 195, height: 165 },
      { x: 86, y: 304, width: 212, height: 166 },
      { x: 334, y: 304, width: 196, height: 173 },
      { x: 555, y: 305, width: 218, height: 169 },
      { x: 799, y: 309, width: 209, height: 168 },
    ],
    jump: [
      { x: 30, y: 343, width: 128, height: 140 },
      { x: 177, y: 335, width: 137, height: 139 },
      { x: 350, y: 347, width: 139, height: 133 },
    ],
    fall: [
      { x: 536, y: 347, width: 129, height: 129 },
      { x: 691, y: 364, width: 121, height: 114 },
      { x: 850, y: 364, width: 116, height: 120 },
    ],
    land: [
      { x: 997, y: 366, width: 147, height: 117 },
      { x: 1149, y: 372, width: 128, height: 112 },
      { x: 1287, y: 373, width: 118, height: 111 },
      { x: 1411, y: 374, width: 120, height: 110 },
    ],
    slapCharge: [
      { x: 31, y: 568, width: 126, height: 117 },
      { x: 194, y: 579, width: 118, height: 108 },
      { x: 330, y: 573, width: 149, height: 113 },
    ],
    slapAttack: [
      { x: 522, y: 568, width: 145, height: 114 },
      { x: 676, y: 539, width: 365, height: 148, offsetX: 72 },
    ],
    slapRecovery: [
      { x: 1074, y: 568, width: 135, height: 115 },
      { x: 1218, y: 571, width: 160, height: 112 },
      { x: 1378, y: 574, width: 137, height: 110 },
    ],
    runSlapCombo: [
      { x: 99, y: 692, width: 119, height: 113, offsetX: -2 },
      { x: 235, y: 687, width: 179, height: 117, offsetX: -30 },
      { x: 414, y: 691, width: 114, height: 115, offsetX: 4 },
      { x: 528, y: 692, width: 183, height: 115, offsetX: -17 },
      { x: 711, y: 687, width: 119, height: 116, offsetX: -6 },
      { x: 832, y: 687, width: 171, height: 115, offsetX: -14 },
    ],
    throw: [
      { x: 90, y: 1078, width: 235, height: 198, offsetX: -2 },
      { x: 427, y: 1089, width: 210, height: 184, offsetX: -4 },
      { x: 769, y: 1089, width: 219, height: 189, offsetX: 3 },
    ],
    hit: [
      { x: 24, y: 761, width: 128, height: 132 },
      { x: 173, y: 759, width: 118, height: 130 },
      { x: 310, y: 759, width: 114, height: 132 },
    ],
    ko: [
      { x: 531, y: 794, width: 140, height: 93 },
      { x: 692, y: 789, width: 151, height: 100 },
      { x: 843, y: 762, width: 181, height: 126 },
    ],
};

const TOPHAT_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 45, y: 83, width: 118, height: 161 },
      { x: 198, y: 83, width: 118, height: 161 },
      { x: 362, y: 83, width: 118, height: 161 },
      { x: 509, y: 83, width: 116, height: 163 },
    ],
    run: [
      { x: 107, y: 55, width: 183, height: 226 },
      { x: 348, y: 61, width: 180, height: 224 },
      { x: 576, y: 57, width: 182, height: 228 },
      { x: 798, y: 59, width: 188, height: 226 },
      { x: 87, y: 301, width: 213, height: 213 },
      { x: 336, y: 301, width: 200, height: 222 },
      { x: 554, y: 301, width: 221, height: 222 },
      { x: 788, y: 303, width: 196, height: 220 },
    ],
    jump: [
      { x: 47, y: 308, width: 118, height: 168 },
      { x: 189, y: 304, width: 127, height: 173 },
      { x: 346, y: 310, width: 134, height: 165 },
    ],
    fall: [
      { x: 533, y: 314, width: 130, height: 166 },
      { x: 706, y: 320, width: 127, height: 154 },
      { x: 893, y: 314, width: 121, height: 162 },
    ],
    land: [
      { x: 1050, y: 323, width: 138, height: 158 },
      { x: 1216, y: 323, width: 139, height: 159 },
      { x: 1363, y: 322, width: 147, height: 160 },
    ],
    slapCharge: [
      { x: 35, y: 530, width: 124, height: 157 },
      { x: 199, y: 533, width: 127, height: 154 },
      { x: 347, y: 533, width: 156, height: 154 },
    ],
    slapAttack: [
      { x: 533, y: 530, width: 154, height: 156 },
      { x: 691, y: 527, width: 362, height: 163, offsetX: 71 },
    ],
    slapRecovery: [
      { x: 1070, y: 528, width: 133, height: 162 },
      { x: 1222, y: 533, width: 147, height: 156 },
      { x: 1374, y: 537, width: 140, height: 153 },
    ],
    runSlapCombo: [
      { x: 105, y: 689, width: 116, height: 162, offsetX: -4 },
      { x: 244, y: 692, width: 177, height: 159, offsetX: -20 },
      { x: 421, y: 699, width: 110, height: 153, offsetX: 2 },
      { x: 531, y: 716, width: 174, height: 139, offsetX: -17 },
      { x: 705, y: 704, width: 116, height: 148, offsetX: -5 },
      { x: 828, y: 714, width: 169, height: 138, offsetX: -11 },
    ],
    throw: [
      { x: 101, y: 1009, width: 216, height: 259, offsetX: -7 },
      { x: 427, y: 1022, width: 200, height: 245, offsetX: -8 },
      { x: 761, y: 1042, width: 214, height: 227, offsetX: 1 },
    ],
    hit: [
      { x: 38, y: 734, width: 125, height: 162 },
      { x: 201, y: 735, width: 114, height: 161 },
      { x: 353, y: 740, width: 101, height: 156 },
    ],
    ko: [
      { x: 457, y: 798, width: 85, height: 97 },
      { x: 548, y: 773, width: 140, height: 124 },
      { x: 704, y: 784, width: 204, height: 118 },
    ],
};

const GOLDCHAIN_FRAMES: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {
    idle: [
      { x: 45, y: 111, width: 128, height: 124 },
      { x: 178, y: 112, width: 126, height: 122 },
      { x: 314, y: 112, width: 126, height: 123 },
      { x: 489, y: 112, width: 128, height: 122 },
    ],
    run: [
      { x: 98, y: 90, width: 190, height: 163 },
      { x: 342, y: 91, width: 183, height: 163 },
      { x: 586, y: 89, width: 188, height: 165 },
      { x: 817, y: 90, width: 191, height: 164 },
      { x: 77, y: 280, width: 211, height: 160 },
      { x: 335, y: 282, width: 200, height: 165 },
      { x: 567, y: 284, width: 217, height: 161 },
      { x: 811, y: 284, width: 206, height: 162 },
    ],
    jump: [
      { x: 50, y: 320, width: 127, height: 149 },
      { x: 203, y: 318, width: 141, height: 146 },
      { x: 381, y: 340, width: 138, height: 126 },
    ],
    fall: [
      { x: 546, y: 332, width: 125, height: 134 },
      { x: 698, y: 346, width: 127, height: 116 },
      { x: 856, y: 341, width: 118, height: 122 },
    ],
    land: [
      { x: 985, y: 356, width: 147, height: 118 },
      { x: 1137, y: 362, width: 137, height: 112 },
      { x: 1274, y: 362, width: 169, height: 114 },
    ],
    slapCharge: [
      { x: 42, y: 548, width: 126, height: 113 },
      { x: 193, y: 556, width: 126, height: 106 },
      { x: 337, y: 548, width: 147, height: 114 },
    ],
    slapAttack: [
      { x: 521, y: 545, width: 152, height: 113 },
      { x: 681, y: 527, width: 347, height: 136, offsetX: 65 },
    ],
    slapRecovery: [
      { x: 1061, y: 545, width: 140, height: 117 },
      { x: 1201, y: 546, width: 168, height: 117 },
      { x: 1369, y: 549, width: 147, height: 114 },
    ],
    runSlapCombo: [
      { x: 100, y: 683, width: 114, height: 106, offsetX: -3 },
      { x: 231, y: 676, width: 183, height: 115, offsetX: -31 },
      { x: 414, y: 682, width: 114, height: 109, offsetX: -1 },
      { x: 528, y: 678, width: 189, height: 115, offsetX: -20 },
      { x: 717, y: 683, width: 113, height: 107, offsetX: -9 },
      { x: 837, y: 677, width: 172, height: 113, offsetX: -14 },
    ],
    throw: [
      { x: 93, y: 1045, width: 230, height: 185, offsetX: -9 },
      { x: 422, y: 1040, width: 213, height: 191, offsetX: -7 },
      { x: 765, y: 1045, width: 229, height: 186, offsetX: -1 },
    ],
    hit: [
      { x: 38, y: 731, width: 138, height: 139 },
      { x: 202, y: 731, width: 124, height: 139 },
      { x: 356, y: 727, width: 111, height: 141 },
    ],
    ko: [
      { x: 590, y: 770, width: 152, height: 97 },
      { x: 758, y: 760, width: 204, height: 106 },
      { x: 983, y: 735, width: 148, height: 134 },
    ],
};

/** Full animation sheets with a single accessory baked into every pose. */
export const BAKED_ACCESSORIES: readonly BakedAccessoryDefinition[] = [
  {
    id: SPRITE_ASSET_IDS.sunglasses,
    label: "Sunglasses",
    slot: "face",
    field: "faceAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/sunglasses/sunglasses.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/sunglasses/sunglasses-17-moves.png"),
    frames: SUNGLASSES_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.crown,
    label: "Crown",
    slot: "head",
    field: "headAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/hat/crown.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/hat/crown-17-moves.png"),
    frames: CROWN_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.redBandana,
    label: "Red Bandana",
    slot: "head",
    field: "headAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/bandana/red-bandana.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/bandana/red-bandana-17-moves.png"),
    frames: REDBANDANA_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.basicCap,
    label: "Black Cap",
    slot: "head",
    field: "headAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/hat/black-cap.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/hat/black-cap-17-moves.png"),
    frames: BASICCAP_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.blueBandana,
    label: "Blue Bandana",
    slot: "head",
    field: "headAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/bandana/blue-bandana.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/bandana/blue-bandana-17-moves.png"),
    frames: BLUEBANDANA_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.topHat,
    label: "Top Hat",
    slot: "head",
    field: "headAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/hat/top-hat.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/hat/top-hat-17-moves.png"),
    frames: TOPHAT_FRAMES,
  },
  {
    id: SPRITE_ASSET_IDS.goldChain,
    label: "Gold Chain",
    slot: "body",
    field: "bodyAccessoryId",
    url: resolveAssetUrl("/assets/characters/accessories/chain/gold-chain.png"),
    movesUrl: resolveAssetUrl("/assets/characters/accessories/chain/gold-chain-17-moves.png"),
    frames: GOLDCHAIN_FRAMES,
  },
];

export const BAKED_ACCESSORY_BY_ID: Record<string, BakedAccessoryDefinition> = Object.fromEntries(
  BAKED_ACCESSORIES.map((accessory) => [accessory.id, accessory]),
);

export const BAKED_ACCESSORY_IDS = BAKED_ACCESSORIES.map((accessory) => accessory.id);

export function isBakedAccessoryId(value: string | null | undefined): value is string {
  return value != null && value in BAKED_ACCESSORY_BY_ID;
}

/** Fields cleared when equipping any baked accessory (mutually exclusive sheets). */
export const BAKED_ACCESSORY_FIELDS = [
  "headAccessoryId",
  "faceAccessoryId",
  "bodyAccessoryId",
] as const satisfies ReadonlyArray<keyof AvatarConfiguration>;

export function bakedAccessoryIdFromAvatar(
  avatar: Pick<AvatarConfiguration, (typeof BAKED_ACCESSORY_FIELDS)[number]> | null | undefined,
): string | null {
  if (!avatar) return null;
  for (const field of BAKED_ACCESSORY_FIELDS) {
    const id = avatar[field];
    if (typeof id === "string" && isBakedAccessoryId(id)) return id;
  }
  return null;
}

export function bakedSheetForAccessoryId(
  accessoryId: string | null | undefined,
): BakedAccessoryDefinition | null {
  if (!accessoryId) return null;
  return BAKED_ACCESSORY_BY_ID[accessoryId] ?? null;
}

/** Animations authored on the dedicated `movesUrl` sheet (run / double-hit / throw). */
export const BAKED_ACCESSORY_MOVE_ANIMATIONS = [
  "run",
  "runSlapCombo",
  "throw",
] as const satisfies ReadonlyArray<FighterAnimation>;

export function isBakedAccessoryMoveAnimation(animation: FighterAnimation): boolean {
  return (BAKED_ACCESSORY_MOVE_ANIMATIONS as readonly string[]).includes(animation);
}

/**
 * Pad (or trim) accessory animation frames to match the base fighter atlas.
 * Extra accessory frames are dropped (first N kept). Missing frames repeat the last pose.
 */
export function normalizeAccessoryFrames(
  frames: Partial<Record<FighterAnimation, readonly FighterFrame[]>>,
): Partial<Record<FighterAnimation, readonly FighterFrame[]>> {
  const normalized: Partial<Record<FighterAnimation, readonly FighterFrame[]>> = {};

  for (const [name, definition] of Object.entries(FIGHTER_ANIMATIONS)) {
    const animation = name as FighterAnimation;
    const accessoryFrames = frames[animation];
    if (!accessoryFrames?.length) continue;

    const targetCount = definition.frames.length;
    const trimmed = accessoryFrames.slice(0, targetCount);
    const lastFrame = trimmed[trimmed.length - 1]!;
    const padded: FighterFrame[] = [];

    for (let i = 0; i < targetCount; i += 1) {
      padded.push(trimmed[Math.min(i, trimmed.length - 1)] ?? lastFrame);
    }

    normalized[animation] = padded;
  }

  return normalized;
}

/** @deprecated Prefer bakedSheetForAccessoryId */
export function bakedSheetForFaceAccessory(
  faceAccessoryId: string | null | undefined,
): BakedAccessoryDefinition | null {
  return bakedSheetForAccessoryId(faceAccessoryId);
}
