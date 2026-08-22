import { Container, Graphics, Text } from "pixi.js";
import { PLAYER_HEIGHT, type PlayerState } from "@tituah/shared";
import { FighterSprite } from "./sprites/fighter-sprite.js";

export class PlayerRenderer {
  private readonly labels = new Map<string, { container: Container; text: Text }>();
  private readonly fighters = new Map<string, FighterSprite>();

  constructor(
    private readonly fighterLayer: Container,
    private readonly labelLayer: Container,
  ) {}

  async load(): Promise<void> {
    const probe = new FighterSprite("preload");
    await probe.load();
    probe.destroy();
  }

  showHit(playerId: string, time: number): void {
    this.fighters.get(playerId)?.showHit(time);
  }

  showKo(playerId: string, time: number): void {
    this.fighters.get(playerId)?.showKo(time);
  }

  draw(players: PlayerState[], time: number): void {
    const seen = new Set<string>();
    const visibleLabels = new Set<string>();
    for (const player of players) {
      seen.add(player.id);
      let fighter = this.fighters.get(player.id);
      if (!fighter) {
        fighter = new FighterSprite(player.id);
        void fighter.load();
        this.fighterLayer.addChild(fighter);
        this.fighters.set(player.id, fighter);
      }
      fighter.update(player, time);

      if (player.lives > 0) {
        visibleLabels.add(player.id);
        this.drawLabel(player);
      }
    }

    for (const [id, label] of this.labels) {
      if (!visibleLabels.has(id)) {
        label.container.destroy({ children: true });
        this.labels.delete(id);
      }
    }
    for (const [id, fighter] of this.fighters) {
      if (!seen.has(id)) {
        fighter.destroy();
        this.fighters.delete(id);
      }
    }
  }

  private drawLabel(player: PlayerState): void {
    let badge = this.labels.get(player.id);
    if (!badge) {
      const container = new Container();
      const background = new Graphics()
        .roundRect(-21, -12, 42, 24, 9)
        .fill({ color: player.spawnIndex % 2 === 0 ? 0xc84f22 : 0x216bc4, alpha: 0.94 })
        .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
      const text = new Text({
        text: "",
        style: {
          fill: 0xffffff,
          fontFamily: "Avenir Next, sans-serif",
          fontSize: 12,
          fontWeight: "800",
        },
      });
      text.anchor.set(0.5);
      container.addChild(background, text);
      this.labelLayer.addChild(container);
      badge = { container, text };
      this.labels.set(player.id, badge);
    }
    badge.text.text = `${Math.round(player.damagePercent)}%`;
    badge.container.x = player.position.x + 38;
    badge.container.y = player.position.y - PLAYER_HEIGHT - 40;
  }
}
