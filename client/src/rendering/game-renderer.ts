import { Application, Container, Graphics } from "pixi.js";
import { DEFAULT_STAGE, type PlayerState } from "@tituah/shared";
import { PlatformRenderer } from "./platform-renderer.js";
import { PlayerRenderer } from "./player-renderer.js";

export class GameRenderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly platformsGfx = new Graphics();
  private readonly playersGfx = new Graphics();
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
    this.world.addChild(this.platformsGfx, this.playersGfx, this.labels);
    this.platforms = new PlatformRenderer(this.platformsGfx);
    this.players = new PlayerRenderer(this.playersGfx, this.labels);
    this.platforms.draw(DEFAULT_STAGE);
  }

  render(players: PlayerState[], time: number): void {
    this.playersGfx.clear();
    this.players.draw(players, time);
  }
}
