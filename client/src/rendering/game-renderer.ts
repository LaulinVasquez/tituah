import { Application, Container, Graphics } from "pixi.js";
import { DEFAULT_STAGE, type PlayerState } from "@tituah/shared";
import { PlatformRenderer } from "./platform-renderer.js";
import { PlayerRenderer } from "./player-renderer.js";

export class GameRenderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly platformsGfx = new Graphics();
  private readonly fighters = new Container();
  private readonly labels = new Container();
  private platforms!: PlatformRenderer;
  private players!: PlayerRenderer;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      width: DEFAULT_STAGE.width,
      height: DEFAULT_STAGE.height,
      background: 0x0b1020,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.world);
    this.world.addChild(this.platformsGfx, this.fighters, this.labels);
    this.platforms = new PlatformRenderer(this.platformsGfx);
    this.players = new PlayerRenderer(this.fighters, this.labels);
    await this.players.load();
    this.platforms.draw(DEFAULT_STAGE);
  }

  showHit(playerId: string, time: number): void {
    this.players.showHit(playerId, time);
  }

  showKo(playerId: string, time: number): void {
    this.players.showKo(playerId, time);
  }

  render(players: PlayerState[], time: number): void {
    this.players.draw(players, time);
  }
}
