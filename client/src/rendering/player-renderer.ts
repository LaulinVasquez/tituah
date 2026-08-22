import { Container, Graphics, Text } from "pixi.js";
import { PLAYER_HEIGHT, PLAYER_WIDTH, type PlayerState } from "@tituah/shared";
import { AttackRenderer } from "./attack-renderer.js";

const COLORS = [0x3ecf8e, 0x5b9dff];

export class PlayerRenderer {
  private readonly attack: AttackRenderer;
  private readonly labels = new Map<string, Text>();
  private readonly names = new Map<string, Text>();

  constructor(
    private readonly graphics: Graphics,
    private readonly labelLayer: Container,
  ) {
    this.attack = new AttackRenderer(graphics);
  }

  draw(players: PlayerState[], time: number): void {
    const seen = new Set<string>();
    for (const player of players) {
      if (player.lives <= 0) continue;
      seen.add(player.id);
      const color = COLORS[player.spawnIndex % COLORS.length] ?? COLORS[0];
      const x = player.position.x - PLAYER_WIDTH / 2;
      const y = player.position.y - PLAYER_HEIGHT;
      const flash = player.invulnerableUntil > time && Math.floor(time * 12) % 2 === 0;

      this.graphics.roundRect(x, y, PLAYER_WIDTH, PLAYER_HEIGHT, 8).fill({
        color,
        alpha: flash ? 0.35 : 1,
      });
      this.graphics.circle(
        player.position.x + 8 * player.facing,
        player.position.y - PLAYER_HEIGHT + 18,
        4,
      ).fill(0x0b1020);

      this.attack.draw(player, time, player.spawnIndex);
      this.drawLabel(player);
    }

    for (const [id, label] of this.labels) {
      if (!seen.has(id)) {
        label.destroy();
        this.labels.delete(id);
        this.names.get(id)?.destroy();
        this.names.delete(id);
      }
    }
  }

  private drawLabel(player: PlayerState): void {
    let name = this.names.get(player.id);
    if (!name) {
      name = new Text({
        text: "",
        style: {
          fill: 0xedf1f7,
          fontFamily: "Avenir Next, sans-serif",
          fontSize: 12,
          fontWeight: "700",
        },
      });
      this.labelLayer.addChild(name);
      this.names.set(player.id, name);
    }
    name.text = player.name;
    name.anchor.set(0.5, 1);
    name.x = player.position.x;
    name.y = player.position.y - PLAYER_HEIGHT - 28;

    let label = this.labels.get(player.id);
    if (!label) {
      label = new Text({
        text: "",
        style: {
          fill: 0xedf1f7,
          fontFamily: "Avenir Next, sans-serif",
          fontSize: 14,
          fontWeight: "700",
        },
      });
      this.labelLayer.addChild(label);
      this.labels.set(player.id, label);
    }
    label.text = `${Math.round(player.damagePercent)}%`;
    label.anchor.set(0.5, 1);
    label.x = player.position.x;
    label.y = player.position.y - PLAYER_HEIGHT - 10;
  }
}
