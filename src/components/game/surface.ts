import type { createSimulation } from "./simulation";
import type { skyAt } from "./sky";

const GROUND_DEPTH = 40;
const MIN_SOIL_ROWS = 25;
const MIN_TIMELINE_PX = 60;

export type Sky = ReturnType<typeof skyAt>;
export type WalkView = ReturnType<ReturnType<typeof createSimulation>["view"]>;

type ArtPixels = number;
type CssPixelsPerArtPixel = number;

export type Viewport = Readonly<{
  key: string;
  scale: CssPixelsPerArtPixel;
  width: ArtPixels;
  height: ArtPixels;
  ground: ArtPixels;
  cardSpan: ArtPixels;
}>;

export type Frame = {
  t: number;
  camera: number;
  camX: number;
  tod: number;
  sky: Sky;
  walk: WalkView;
};

export type Hole = { x: ArtPixels; y: ArtPixels; radius: ArtPixels; camera: ArtPixels };

export type WalkSurface = {
  readonly elements: readonly HTMLElement[];
  resize(viewport: Viewport): void;
  paint(frame: Frame): void;
  cut(hole: Hole): void;
};

export const sizeKey = (view: HTMLElement) => `${view.clientWidth} ${view.clientHeight} ${window.devicePixelRatio || 1}`;

export function measureViewport(view: HTMLElement): Viewport {
  const w = view.clientWidth;
  const h = view.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const devicePixelsPerArtPixel = Math.max(2, Math.min(Math.floor((h * dpr) / 300), Math.floor((w * dpr) / 250)));
  const scale = devicePixelsPerArtPixel / dpr;
  const width = Math.ceil(w / scale);
  const height = Math.ceil(h / scale);
  const soil = Math.max(MIN_SOIL_ROWS, Math.ceil(MIN_TIMELINE_PX / scale));
  view.style.setProperty("--soil", `${soil}`);
  let cardSpan = 0;
  const card = view.querySelector<HTMLElement>(".walk-card");
  if (card) {
    const gutter = Math.min(card.offsetLeft, w - card.offsetLeft - card.offsetWidth);
    const fullWidth = card.offsetWidth + gutter * 2 >= w - 1;
    cardSpan = fullWidth ? 0 : (card.offsetWidth + gutter) / scale;
  }
  return { key: sizeKey(view), scale, width, height, ground: height - GROUND_DEPTH - (soil - MIN_SOIL_ROWS), cardSpan };
}

export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number) {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
}

export function slideInDevicePixels(element: HTMLElement, artPixels: ArtPixels, scale: CssPixelsPerArtPixel, slid: number) {
  const dpr = window.devicePixelRatio;
  const slide = Math.round(artPixels * scale * dpr);
  if (slide !== slid) element.style.transform = `translate3d(${-slide / dpr}px, 0, 0)`;
  return slide;
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
