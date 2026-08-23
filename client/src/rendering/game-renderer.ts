import { Application, Container, Graphics } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH, type PlayerState } from "@tituah/shared";
import { PlayerRenderer } from "./player-renderer.js";
import { pixiOptions } from "./renderer-options.js";
import { StageRenderer } from "./stages/stage-renderer.js";

export class GameRenderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly gameplay = new Container();
  private readonly stage = new StageRenderer();
  private readonly fighters = new Container();
  private readonly impacts = new Graphics();
  private readonly voidEffects = new Graphics();
  private readonly labels = new Container();
  private players!: PlayerRenderer;
  private cameraX = GAME_WIDTH / 2;
  private cameraY = GAME_HEIGHT / 2;
  private cameraZoom = 0.86;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init(pixiOptions(canvas, {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      background: 0x0b1020,
      autoStart: false,
    }));
    this.app.ticker.stop();
    this.app.ticker.autoStart = false;
    this.app.stage.eventMode = "none";
    this.app.stage.interactiveChildren = false;
    this.world.eventMode = "none";
    this.world.interactiveChildren = false;
    // Pixi sets inline pixel dimensions for auto-density; CSS owns the display size.
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.app.stage.addChild(this.world);
    this.gameplay.addChild(
      this.stage.props,
      this.stage.platforms,
      this.stage.shadows,
      this.fighters,
      this.impacts,
      this.labels,
    );
    this.world.addChild(
      this.stage.far,
      this.stage.distant,
      this.gameplay,
      this.stage.foreground,
      this.voidEffects,
    );
    this.players = new PlayerRenderer(this.fighters, this.impacts, this.voidEffects, this.labels);
    await Promise.all([this.players.load(), this.stage.load()]);
  }

  setStage(stageId: string): void {
    this.stage.setStage(stageId);
  }

  showHit(hit: import("@tituah/shared").PlayerHitMessage, time: number): void {
    this.players.showHit(hit, time);
  }

  showKo(playerId: string, time: number): void {
    this.players.showKo(playerId, time);
  }

  showVoidDeath(playerId: string, time: number): void {
    this.players.showVoidDeath(playerId, time);
  }

  render(players: PlayerState[], time: number): void {
    this.stage.update(players, time);
    this.updateCamera(players);
    this.players.draw(players, time);
    this.app.render();
  }

  private updateCamera(players: PlayerState[]): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let living = 0;
    for (const player of players) {
      if (player.lives <= 0) continue;
      living += 1;
      const { x, y } = player.position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (living) {
      const targetX = Math.max(500, Math.min(780, (minX + maxX) / 2));
      const targetY = Math.max(320, Math.min(430, (minY + maxY) / 2));
      const separation = Math.max((maxX - minX) / 820, (maxY - minY) / 500);
      const targetZoom = Math.max(0.72, Math.min(0.86, 0.9 - separation * 0.12));
      this.cameraX += (targetX - this.cameraX) * 0.075;
      this.cameraY += (targetY - this.cameraY) * 0.075;
      this.cameraZoom += (targetZoom - this.cameraZoom) * 0.075;
    }
    this.gameplay.pivot.set(this.cameraX, this.cameraY);
    this.gameplay.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.gameplay.scale.set(this.cameraZoom);
  }
}
