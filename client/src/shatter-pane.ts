const COLS = 4;
const ROWS = 5;
const SHATTER_MS = 720;

export async function shatterElement(source: HTMLElement, impact: HTMLElement): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const rect = source.getBoundingClientRect();
  const hit = impact.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;

  const layer = document.querySelector("#shatter-layer");
  if (!(layer instanceof HTMLElement)) return;
  layer.replaceChildren();
  layer.hidden = false;

  const cellW = rect.width / COLS;
  const cellH = rect.height / ROWS;
  const impactX = hit.left + hit.width / 2;
  const impactY = hit.top + hit.height / 2;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const shard = document.createElement("div");
      shard.className = "shatter-shard";
      const x = rect.left + col * cellW;
      const y = rect.top + row * cellH;
      shard.style.left = `${x}px`;
      shard.style.top = `${y}px`;
      shard.style.width = `${cellW + 1}px`;
      shard.style.height = `${cellH + 1}px`;
      shard.style.clipPath = jaggedClip(col, row);

      const inner = source.cloneNode(true) as HTMLElement;
      inner.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      inner.style.position = "absolute";
      inner.style.left = `${-col * cellW}px`;
      inner.style.top = `${-row * cellH}px`;
      inner.style.width = `${rect.width}px`;
      inner.style.height = `${rect.height}px`;
      inner.style.margin = "0";
      inner.style.transform = "none";
      inner.style.animation = "none";
      shard.append(inner);

      const cx = x + cellW / 2;
      const cy = y + cellH / 2;
      const dx = cx - impactX;
      const dy = cy - impactY;
      const dist = Math.hypot(dx, dy) || 1;
      const force = 160 + Math.random() * 260;
      const tx = (dx / dist) * force + 70 + Math.random() * 90;
      const ty = (dy / dist) * force * 0.35 + 380 + Math.random() * 320;
      const rot = (dx >= 0 ? 1 : -1) * (90 + Math.random() * 240);
      shard.style.setProperty("--tx", `${tx}px`);
      shard.style.setProperty("--ty", `${ty}px`);
      shard.style.setProperty("--rot", `${rot}deg`);
      shard.style.animationDelay = `${Math.min(140, dist * 0.22)}ms`;
      layer.append(shard);
    }
  }

  source.classList.add("is-shattering");
  await wait(SHATTER_MS);
  layer.replaceChildren();
  layer.hidden = true;
}

function jaggedClip(col: number, row: number): string {
  const j = (seed: number) => 4 + ((col * 7 + row * 13 + seed) % 11);
  return `polygon(${j(1)}% 0%, 100% ${j(2)}%, ${100 - j(3)}% 100%, 0% ${100 - j(4)}%)`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
