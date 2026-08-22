import {
  clonePlayerState,
  INTERPOLATION_DELAY,
  lerp,
  type MatchSnapshot,
  type PlayerState,
} from "@tituah/shared";

interface BufferedSnapshot {
  receivedAt: number;
  snapshot: MatchSnapshot;
}

export class InterpolationManager {
  private buffer: BufferedSnapshot[] = [];

  reset(snapshot: MatchSnapshot): void {
    this.buffer = [{ receivedAt: performance.now() / 1000, snapshot }];
  }

  push(snapshot: MatchSnapshot): void {
    this.buffer.push({ receivedAt: performance.now() / 1000, snapshot });
    if (this.buffer.length > 12) {
      this.buffer.shift();
    }
  }

  getPlayer(playerId: string, now = performance.now() / 1000): PlayerState | null {
    const renderAt = now - INTERPOLATION_DELAY;
    if (this.buffer.length === 0) return null;

    let from = this.buffer[0];
    let to = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i += 1) {
      if (this.buffer[i].receivedAt <= renderAt && this.buffer[i + 1].receivedAt >= renderAt) {
        from = this.buffer[i];
        to = this.buffer[i + 1];
        break;
      }
    }

    const a = from.snapshot.players.find((player) => player.id === playerId);
    const b = to.snapshot.players.find((player) => player.id === playerId);
    if (!a && !b) return null;
    if (!a) return clonePlayerState(b!);
    if (!b || from === to) return clonePlayerState(a);

    const span = Math.max(0.0001, to.receivedAt - from.receivedAt);
    const t = Math.min(1, Math.max(0, (renderAt - from.receivedAt) / span));
    const interpolated = clonePlayerState(b);
    interpolated.position.x = lerp(a.position.x, b.position.x, t);
    interpolated.position.y = lerp(a.position.y, b.position.y, t);
    interpolated.velocity.x = lerp(a.velocity.x, b.velocity.x, t);
    interpolated.velocity.y = lerp(a.velocity.y, b.velocity.y, t);
    return interpolated;
  }
}
