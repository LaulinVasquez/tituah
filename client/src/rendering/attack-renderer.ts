import { Graphics } from "pixi.js";
import {
  getAttack,
  getAttackChargeFromState,
  getChargedAttackValues,
  getHandVisual,
  getMeleeHitbox,
  PRIMARY_ATTACK_ID,
  type PlayerState,
} from "@tituah/shared";

const HAND_COLORS = [0xffe08a, 0xff7a45];

export class AttackRenderer {
  constructor(private readonly graphics: Graphics) {}

  draw(player: PlayerState, time: number, colorIndex: number): void {
    const hand = getHandVisual(player, time);
    const charging = player.attackState.type === "charging";
    const active = player.attackState.type === "active";
    if (!charging && !active) return;

    const x = player.position.x + hand.offsetX;
    const y = player.position.y + hand.offsetY;
    const radius = 16 * hand.scale;
    const color = HAND_COLORS[colorIndex % HAND_COLORS.length];

    this.graphics.circle(x, y, radius + 8).fill({ color, alpha: charging ? 0.18 : 0.28 });
    this.graphics.circle(x, y, radius).fill(color);
    this.graphics.circle(x - 4 * player.facing, y - 4, radius * 0.28).fill(0xfff4d2);

    if (active) {
      const values = getChargedAttackValues(
        getAttack(PRIMARY_ATTACK_ID),
        getAttackChargeFromState(player.attackState, time),
      );
      const box = getMeleeHitbox(player, values);
      this.graphics.rect(box.x, box.y, box.width, box.height).fill({ color: 0xffffff, alpha: 0.12 });
    }
  }
}
