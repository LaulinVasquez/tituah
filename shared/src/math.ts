export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function cloneVec2(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function aabb(x: number, y: number, width: number, height: number): AABB {
  return { x, y, width, height };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function playerBounds(position: Vec2, width: number, height: number): AABB {
  return {
    x: position.x - width / 2,
    y: position.y - height,
    width,
    height,
  };
}
