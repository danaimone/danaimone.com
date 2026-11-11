import type { Art } from "./assets";
import { rng } from "./math";
import { PROP_SHEET, TREE_SHEET } from "./sheets";
import { plantStands, plantUnderstory, groundAt } from "./path";
import { cutHole, slideInDevicePixels, tintOver, type Frame, type Viewport, type WalkSurface } from "./surface";
import { LANDMARKS, WORLD_WIDTH } from "./world";

const LAYER_STRETCH = 32;
const LAYER_BASE = 2;
const SKYLINE_PARALLAX = 0.26;
const SKYLINE_ROWS = 170;
const SKYLINE_X = { rattlesnake: 0, olympics: 500, issaquah: 1040, beyond: 1570 };
const SKYLINE_RISE = 8;
const RANGE_RISE = -26;
const HILLS_PARALLAX = 0.4;
const HILLS_TURN_WORLD_X = 1100;
const SEATTLE_LAYER_X = 830;
const SEATTLE_RISE = 34;
const GREAT_WHEEL = { offset: 236, reach: 16 };
const FAR_TREE_PARALLAX = 0.55;
const FAR_TREE_SCALE = 0.62;
const FAR_TREE_HAZE = 0.34;
const HAZE = "#8fb3c9";
const NEAR_TREE_PARALLAX = 0.7;
const FIRST_NEAR_TREE = 340;
const TREE_BUILDING_MARGIN = 50;
const MEADOW_PARALLAX = 0.86;
const MEADOW_TURN_WORLD_X = 1180;
const UNDERSTORY_DEPTH = 14;

type Size = { width: number; height: number };
type TurningTiles = { before: HTMLImageElement; turn: HTMLImageElement; after: HTMLImageElement };
type Scene = { art: Art; viewport: Viewport; travel: number };
type LayerRecipe = {
  parallax: number;
  rows(art: Art): number;
  paint(c: CanvasRenderingContext2D, width: number, scene: Scene): void;
};

function drawSprite(c: CanvasRenderingContext2D, sheet: HTMLImageElement, kind: number, cell: Size, x: number, y: number, drawn: Size, flipped: boolean) {
  if (!flipped) {
    c.drawImage(sheet, kind * cell.width, 0, cell.width, cell.height, x, y, drawn.width, drawn.height);
    return;
  }
  c.save();
  c.translate(x + drawn.width, y);
  c.scale(-1, 1);
  c.drawImage(sheet, kind * cell.width, 0, cell.width, cell.height, 0, 0, drawn.width, drawn.height);
  c.restore();
}

function tileThroughTurn(c: CanvasRenderingContext2D, { before, turn, after }: TurningTiles, turnX: number, width: number, baseY: number) {
  for (let x = turnX - before.width; x > -before.width; x -= before.width) c.drawImage(before, x, baseY - before.height);
  c.drawImage(turn, turnX, baseY - turn.height);
  for (let x = turnX + turn.width; x < width; x += after.width) c.drawImage(after, x, baseY - after.height);
}

const layerXAt = (worldX: number, parallax: number, viewWidth: number) => Math.round((worldX - viewWidth / 2) * parallax + viewWidth / 2);
const worldXAt = (layerX: number, parallax: number, viewWidth: number) => (layerX - viewWidth / 2) / parallax + viewWidth / 2;

function paintGroves(c: CanvasRenderingContext2D, width: number, { art, viewport, travel }: Scene, parallax: number, random: () => number, scale: number) {
  const { width: vw, ground } = viewport;
  const drawn = { width: Math.round(TREE_SHEET.width * scale), height: Math.round(TREE_SHEET.height * scale) };
  const clearOfBuildings = (worldX: number) =>
    LANDMARKS.every((landmark) => worldX < landmark.x - TREE_BUILDING_MARGIN || worldX > landmark.x + landmark.width + TREE_BUILDING_MARGIN);
  const wheelX = SEATTLE_LAYER_X + GREAT_WHEEL.offset;
  const wheelOnScreenFrom = Math.max(0, (wheelX - vw) / HILLS_PARALLAX);
  const wheelOnScreenTo = Math.min(travel, wheelX / HILLS_PARALLAX);
  const clearOfWheel = (layerX: number) =>
    layerX + drawn.width + GREAT_WHEEL.reach < wheelX + (parallax - HILLS_PARALLAX) * wheelOnScreenFrom ||
    layerX - GREAT_WHEEL.reach > wheelX + (parallax - HILLS_PARALLAX) * wheelOnScreenTo;
  for (const tree of plantStands(random, FIRST_NEAR_TREE, width, drawn.width, (x) => groundAt(worldXAt(x, parallax, vw)))) {
    if (!clearOfBuildings(worldXAt(tree.x, parallax, vw)) || !clearOfWheel(tree.x)) continue;
    drawSprite(c, art.trees, tree.kind, TREE_SHEET, tree.x, ground + LAYER_BASE - drawn.height, drawn, tree.flipped);
  }
}

function paintUnderstory(c: CanvasRenderingContext2D, width: number, { art, viewport }: Scene) {
  const { width: vw, ground } = viewport;
  for (const plant of plantUnderstory(rng(57), width, (x) => groundAt(worldXAt(x, MEADOW_PARALLAX, vw)))) {
    const top = ground + LAYER_BASE - PROP_SHEET.height - Math.round(plant.depth * UNDERSTORY_DEPTH);
    drawSprite(c, art.props, plant.kind, PROP_SHEET, plant.x, top, PROP_SHEET, plant.flipped);
  }
}

const LAYERS_BACK_TO_FRONT: readonly LayerRecipe[] = [
  {
    parallax: SKYLINE_PARALLAX,
    rows: () => SKYLINE_ROWS,
    paint(c, _width, { art, viewport: { ground } }) {
      const [rattlesnake, olympics, issaquah] = art.skylines;
      const place = (skyline: HTMLImageElement, x: number, rise: number) => c.drawImage(skyline, x, ground - rise - skyline.height);
      c.save();
      c.translate(SKYLINE_X.beyond * 2 + issaquah.width, 0);
      c.scale(-1, 1);
      place(issaquah, SKYLINE_X.beyond, RANGE_RISE);
      c.restore();
      place(olympics, SKYLINE_X.olympics, RANGE_RISE);
      place(issaquah, SKYLINE_X.issaquah, RANGE_RISE);
      place(rattlesnake, SKYLINE_X.rattlesnake, SKYLINE_RISE);
    },
  },
  {
    parallax: HILLS_PARALLAX,
    rows: (art) => art.seattle.height + SEATTLE_RISE + LAYER_BASE,
    paint(c, width, { art, viewport: { width: vw, ground } }) {
      tileThroughTurn(c, art.foothills, layerXAt(HILLS_TURN_WORLD_X, HILLS_PARALLAX, vw), width, ground + LAYER_BASE);
      c.drawImage(art.seattle, SEATTLE_LAYER_X, ground - SEATTLE_RISE - art.seattle.height);
    },
  },
  {
    parallax: FAR_TREE_PARALLAX,
    rows: () => TREE_SHEET.height,
    paint(c, width, scene) {
      c.imageSmoothingEnabled = false;
      paintGroves(c, width, scene, FAR_TREE_PARALLAX, rng(34), FAR_TREE_SCALE);
      tintOver(c, HAZE, FAR_TREE_HAZE, width, scene.viewport.height);
    },
  },
  {
    parallax: NEAR_TREE_PARALLAX,
    rows: () => TREE_SHEET.height,
    paint: (c, width, scene) => paintGroves(c, width, scene, NEAR_TREE_PARALLAX, rng(21), 1),
  },
  {
    parallax: MEADOW_PARALLAX,
    rows: () => PROP_SHEET.height + UNDERSTORY_DEPTH,
    paint(c, width, scene) {
      const { width: vw, ground } = scene.viewport;
      tileThroughTurn(c, scene.art.meadow, layerXAt(MEADOW_TURN_WORLD_X, MEADOW_PARALLAX, vw), width, ground + LAYER_BASE);
      paintUnderstory(c, width, scene);
    },
  },
];

export const PARALLAX_LAYERS = LAYERS_BACK_TO_FRONT.length;

type Layer = {
  strip: HTMLCanvasElement;
  surface: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  parallax: number;
  top: number;
  rows: number;
  left: number;
  slid: number;
  paintedShade: string;
};

export function createParallax(canvases: HTMLCanvasElement[], art: Art): WalkSurface {
  let viewport: Viewport;
  let layers: Layer[] = [];

  return {
    elements: canvases,
    resize(next) {
      viewport = next;
      const { width, height, ground, scale } = viewport;
      const scene = { art, viewport, travel: WORLD_WIDTH - width };
      layers = LAYERS_BACK_TO_FRONT.map((recipe, index) => {
        const rows = recipe.rows(art);
        const strip = document.createElement("canvas");
        strip.width = Math.ceil(scene.travel * recipe.parallax + width) + LAYER_STRETCH;
        strip.height = rows;
        const context = strip.getContext("2d")!;
        const top = ground + LAYER_BASE - rows;
        context.translate(0, -top);
        recipe.paint(context, strip.width, scene);
        const surface = canvases[index];
        surface.width = width + LAYER_STRETCH;
        surface.height = rows;
        surface.style.width = `${surface.width * scale}px`;
        surface.style.height = `${rows * scale}px`;
        surface.style.bottom = `${(height - top - rows) * scale}px`;
        return { strip, surface, ctx: surface.getContext("2d")!, parallax: recipe.parallax, top, rows, left: NaN, slid: -1, paintedShade: "" };
      });
    },
    paint({ camera, sky: { tint, tintAlpha } }: Frame) {
      const shade = tintAlpha > 0.005 ? `${tint} ${Math.round(tintAlpha * 200)}` : "";
      for (const layer of layers) {
        const offset = camera * layer.parallax;
        const left = Math.floor(offset / LAYER_STRETCH) * LAYER_STRETCH;
        if (left !== layer.left || shade !== layer.paintedShade) {
          layer.left = left;
          layer.paintedShade = shade;
          const c = layer.ctx;
          const { width } = layer.surface;
          c.clearRect(0, 0, width, layer.rows);
          c.drawImage(layer.strip, left, 0, width, layer.rows, 0, 0, width, layer.rows);
          if (shade) tintOver(c, tint, tintAlpha, width, layer.rows);
        }
        layer.slid = slideInDevicePixels(layer.surface, offset - left, viewport.scale, layer.slid);
      }
    },
    cut(hole) {
      for (const layer of layers) {
        cutHole(layer.ctx, hole.x + (hole.camera * layer.parallax - layer.left), hole.y - layer.top, hole.radius);
        layer.paintedShade = "cut";
      }
    },
  };
}
