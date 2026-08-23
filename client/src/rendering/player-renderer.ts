import { Container, Graphics, Text } from "pixi.js";
import { PLAYER_HEIGHT, type PlayerHitMessage, type PlayerState } from "@tituah/shared";
import { FighterSprite } from "./sprites/fighter-sprite.js";

interface ImpactEffect {
  x: number;
  y: number;
  startedAt: number;
  strength: number;
}

interface VoidDeathEffect {
  x: number;
  startedAt: number;
  color: number;
}

const IMPACT_DURATION = 0.24;
const VOID_EFFECT_DURATION = 0.72;

export class PlayerRenderer {
  private readonly labels = new Map<string, { container: Container; text: Text }>();
  private readonly names = new Map<string, Text>();
  private readonly fighters = new Map<string, FighterSprite>();
  private readonly lastPlayers = new Map<string, PlayerState>();
  private readonly impacts: ImpactEffect[] = [];
  private readonly voidDeaths: VoidDeathEffect[] = [];

  constructor(
    private readonly fighterLayer: Container,
    private readonly impactLayer: Graphics,
    private readonly voidEffectLayer: Graphics,
    private readonly labelLayer: Container,
  ) {
    this.fighterLayer.sortableChildren = true;
  }

  async load(): Promise<void> {
    const probe = new FighterSprite("preload");
    await probe.load();
    probe.destroy();
  }

  showHit(hit: PlayerHitMessage, time: number): void {
    const attacker = this.lastPlayers.get(hit.attackerId);
    const target = this.lastPlayers.get(hit.targetId);
    const direction = target && attacker
      ? Math.sign(target.position.x - attacker.position.x) || 1
      : Math.sign(hit.knockback.x) || 1;
    const strength = 0.8 + hit.charge;
    this.fighters.get(hit.targetId)?.showHit(time, direction, strength);
    if (target) {
      this.impacts.push({
        x: attacker ? target.position.x * 0.72 + attacker.position.x * 0.28 : target.position.x,
        y: target.position.y - PLAYER_HEIGHT * 0.62,
        startedAt: time,
        strength,
      });
    }
  }

  showKo(playerId: string, time: number): void {
    this.fighters.get(playerId)?.showKo(time);
  }

  showVoidDeath(playerId: string, time: number): void {
    const player = this.lastPlayers.get(playerId);
    this.fighters.get(playerId)?.showVoidDeath(time);
    if (!player) return;

    const { x } = player.position;
    this.voidDeaths.push({
      x: Math.max(90, Math.min(1190, x)),
      startedAt: time,
      color: player.spawnIndex % 2 === 0 ? 0xff7a45 : 0x5b9dff,
    });
  }

  draw(players: PlayerState[], time: number): void {
    const seen = new Set<string>();
    const visibleLabels = new Set<string>();
    this.lastPlayers.clear();
    for (const player of players) {
      this.lastPlayers.set(player.id, player);
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
        this.names.get(id)?.destroy();
        this.names.delete(id);
      }
    }
    for (const [id, fighter] of this.fighters) {
      if (!seen.has(id)) {
        fighter.destroy();
        this.fighters.delete(id);
      }
    }
    this.drawImpacts(time);
    this.drawVoidDeaths(time);
  }

  private drawImpacts(time: number): void {
    this.impactLayer.clear();
    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const impact = this.impacts[index];
      const progress = (time - impact.startedAt) / IMPACT_DURATION;
      if (progress >= 1) {
        this.impacts.splice(index, 1);
        continue;
      }
      const eased = Math.max(0, progress);
      const alpha = 1 - eased;
      const radius = (13 + eased * 34) * impact.strength;
      this.impactLayer.circle(impact.x, impact.y, radius * 0.42).fill({
        color: 0xfff3a3,
        alpha: alpha * 0.78,
      });
      this.impactLayer.circle(impact.x, impact.y, radius * 0.2).fill({
        color: 0xffffff,
        alpha,
      });
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = (Math.PI * 2 * ray) / 8;
        const inner = radius * 0.5;
        const outer = radius;
        this.impactLayer
          .moveTo(impact.x + Math.cos(angle) * inner, impact.y + Math.sin(angle) * inner)
          .lineTo(impact.x + Math.cos(angle) * outer, impact.y + Math.sin(angle) * outer)
          .stroke({ color: 0xffc247, width: 4 * impact.strength, alpha });
      }
    }
  }

  private drawVoidDeaths(time: number): void {
    this.voidEffectLayer.clear();
    for (let index = this.voidDeaths.length - 1; index >= 0; index -= 1) {
      const effect = this.voidDeaths[index];
      const progress = Math.max(0, (time - effect.startedAt) / VOID_EFFECT_DURATION);
      if (progress >= 1) {
        this.voidDeaths.splice(index, 1);
        continue;
      }
      const alpha = 1 - progress;
      const ring = 18 + progress * 92;
      const headY = -40 + progress * 800;
      this.voidEffectLayer.circle(effect.x, headY, ring)
        .stroke({ color: effect.color, width: 9 * alpha + 2, alpha: alpha * 0.9 });
      this.voidEffectLayer.circle(effect.x, headY, ring * 0.58)
        .stroke({ color: 0xffffff, width: 5 * alpha + 1, alpha });

      const beamWidth = 26 * alpha + 5;
      this.voidEffectLayer
        .moveTo(effect.x, Math.max(-30, headY - 260))
        .lineTo(effect.x, headY)
        .stroke({ color: effect.color, width: beamWidth, alpha: alpha * 0.72 });
      for (let spark = 0; spark < 10; spark += 1) {
        const angle = (Math.PI * 2 * spark) / 10 + progress;
        const distance = ring * (0.7 + (spark % 3) * 0.18);
        this.voidEffectLayer.circle(
          effect.x + Math.cos(angle) * distance,
          headY + Math.sin(angle) * distance,
          3 + (spark % 2) * 2,
        ).fill({ color: spark % 2 ? effect.color : 0xffffff, alpha });
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
    name.y = player.position.y - PLAYER_HEIGHT - 58;

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
