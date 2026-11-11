import type { createSimulation } from "./simulation";
import type { skyAt } from "./sky";

const GROUND_DEPTH = 40;
// Rows of soil under the path; the timeline sits here.
const SOIL_DEPTH = 25;
const MIN_TIMELINE_PX = 60;

export type Sky = ReturnType<typeof skyAt>;
export type WalkView = ReturnType<ReturnType<typeof createSimulation>["view"]>;

// Replaced whole on resize, never changed in place, so every surface sees the same
// layout. Sizes are in art pixels; `scale` is CSS pixels per art pixel.
export type Viewport = {
  key: string;
  scale: number;
  width: number;
  height: number;
  ground: number;
  cardSpan: number;
};

// What one frame paints from. Built only on frames that repaint the walk.
export type Frame = {
  t: number;
  camera: number;
  camX: number;
  tod: number;
  sky: Sky;
  walk: WalkView;
};

// The iris, in view art pixels. Each surface offsets it by how far it has slid.
export type Hole = { x: number; y: number; radius: number; camera: number };

// One canvas of the walk, or a set that moves together. Each owns its pixels, its
// size and its transform; nothing else draws on it.
export type WalkSurface = {
  readonly elements: readonly HTMLElement[];
  resize(viewport: Viewport): void;
  paint(frame: Frame): void;
  cut(hole: Hole): void;
};

export const sizeKey = (view: HTMLElement) => `${view.clientWidth} ${view.clientHeight} ${window.devicePixelRatio || 1}`;

// The canvas is scaled by a whole number of device pixels, so art pixels stay
// square and sharp on any screen.
export function measureViewport(view: HTMLElement): Viewport {
  const w = view.clientWidth;
  const h = view.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const device = Math.max(2, Math.min(Math.floor((h * dpr) / 300), Math.floor((w * dpr) / 250)));
  const scale = device / dpr;
  const width = Math.ceil(w / scale);
  const height = Math.ceil(h / scale);
  const soil = Math.max(SOIL_DEPTH, Math.ceil(MIN_TIMELINE_PX / scale));
  view.style.setProperty("--soil", `${soil}`);
  let cardSpan = 0;
  const card = view.querySelector<HTMLElement>(".walk-card");
  if (card) {
    const gutter = Math.min(card.offsetLeft, w - card.offsetLeft - card.offsetWidth);
    const fullWidth = card.offsetWidth + gutter * 2 >= w - 1;
    cardSpan = fullWidth ? 0 : (card.offsetWidth + gutter) / scale;
  }
  return { key: sizeKey(view), scale, width, height, ground: height - GROUND_DEPTH - (soil - SOIL_DEPTH), cardSpan };
}

export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number) {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
}

export function cutHole(c: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  c.globalCompositeOperation = "destination-out";
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "source-over";
}

export function tintOver(c: CanvasRenderingContext2D, tint: string, alpha: number, width: number, height: number) {
  c.globalCompositeOperation = "source-atop";
  c.globalAlpha = alpha;
  c.fillStyle = tint;
  c.fillRect(0, 0, width, height);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}
