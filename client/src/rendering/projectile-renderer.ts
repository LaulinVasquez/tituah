import { Container, Sprite, type Texture } from "pixi.js";
import { throwableIdFromAvatar, type Projectile, type ThrowableId } from "@tituah/shared";
import {
  PROJECTILE_DISPLAY_SCALE,
  PROJECTILE_FPS,
  PROJECTILE_FRAME_COUNT,
  loadProjectileTextures,
  projectileTexturesFor,
} from "./sprites/projectile-atlas.js";

interface ProjectileView {
  root: Container;
  sprite: Sprite;
  throwableId: ThrowableId;
}

export class ProjectileRenderer {
  readonly layer = new Container();
  private textures: Record<ThrowableId, Texture[]> | null = null;
  private readonly views = new Map<string, ProjectileView>();

  constructor() {
    this.layer.eventMode = "none";
    this.layer.interactiveChildren = false;
  }

  async load(): Promise<void> {
    this.textures = await loadProjectileTextures();
  }

  draw(projectiles: Projectile[]): void {
    if (!this.textures) return;
    const seen = new Set<string>();
    for (const projectile of projectiles) {
      seen.add(projectile.id);
      const throwableId = throwableIdFromAvatar(projectile.throwableId);
      const frames = projectileTexturesFor(this.textures, throwableId);
      const view = this.ensureView(projectile.id, throwableId, frames[0]);
      if (view.throwableId !== throwableId) {
        view.throwableId = throwableId;
      }
      const frameIndex = Math.floor(projectile.age * PROJECTILE_FPS) % PROJECTILE_FRAME_COUNT;
      view.sprite.texture = frames[frameIndex] ?? frames[0];
      view.root.position.set(projectile.position.x, projectile.position.y);
      const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
      view.root.rotation = angle;
      view.root.scale.set(
        PROJECTILE_DISPLAY_SCALE * (projectile.velocity.x >= 0 ? 1 : -1),
        PROJECTILE_DISPLAY_SCALE,
      );
    }

    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.layer.removeChild(view.root);
      view.root.destroy({ children: true });
      this.views.delete(id);
    }
  }

  reset(): void {
    for (const view of this.views.values()) {
      this.layer.removeChild(view.root);
      view.root.destroy({ children: true });
    }
    this.views.clear();
  }

  private ensureView(id: string, throwableId: ThrowableId, texture: Texture): ProjectileView {
    const existing = this.views.get(id);
    if (existing) return existing;

    const root = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    root.addChild(sprite);
    this.layer.addChild(root);
    const view = { root, sprite, throwableId };
    this.views.set(id, view);
    return view;
  }
}
