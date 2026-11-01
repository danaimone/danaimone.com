import type { Doom, DoomEnd } from "./doom";
import { driveWithFinger } from "./finger";
import { DITHER_PERIOD, GROUND_DEPTH, SOIL_DEPTH, columnsOf, drawGem, drawPuff, drawSun, mix, paintGround, paintSky, rng, skyAt, smokePuffs, soilFlecks, sunHalo, tileThroughTurn } from "./art";
import { buildPath, placeProps, surfaceAt } from "./path";
import { CLOUD_KINDS, DAN_SHEET, MISHKA_SHEET, PROP_SHEET, TREE_SHEET, loadArt, type Art } from "./assets";
import layouts from "./room-layouts.json";
import { ROOM_SCALE, createRoomScene } from "./room-scene";
import { CONTACT_FINALE, cameraAt, createSimulation, createStepClock, type WalkDirection, type Zone } from "./simulation";
import { createTerminal } from "./terminal";
import { FRACTION_PER_WORLD_PX, clamp, progressAt, type Destination } from "./track";
import { BEACON, CHIMNEY, DOOR, GEMS, LANDMARKS, WORLD_WIDTH, spriteTop } from "./world";

const SEATTLE_LAYER_X = 830;
const ROOMS = {
  wide: {
    ...layouts.wide,
    focusX: 0.7,
    focusY: 0.8,
    anchorY: 0.7889,
    subjectSpan: 0.56,
  },
  tall: {
    ...layouts.tall,
    keep: [80, 453] as const,
    focusY: 0.6594,
    anchorY: 0.6642,
    subjectSpan: 0.66,
  },
};
const WIDE_ROOM_MIN_ASPECT = 1.1;

// The tall room keeps Dan's back through the firebox in view: centred when the
// span fits, otherwise the firebox end wins and the chair back is what gets cut.
function roomLeft(room: (typeof ROOMS)[keyof typeof ROOMS], pixel: number, viewW: number) {
  if (!("keep" in room)) return viewW / 2 - room.focusX * room.width * pixel;
  const [from, to] = room.keep;
  if ((to - from) * pixel > viewW) return viewW - to * pixel;
  return viewW / 2 - ((from + to) / 2) * pixel;
}
const ROOM_SCALE_SNAP = 0.05;
const REVEAL = { from: 3380, to: 3930, summitAt: 0.56, baseBelowGround: 6, buriedTop: 70, drift: 34 };
const FIRST_NEAR_TREE = 340;
const TREE_BUILDING_MARGIN = 110;
const SKYLINE_PARALLAX = 0.26;
const SKYLINE_X = { rattlesnake: 0, olympics: 500, issaquah: 1040, beyond: 1570 };
const SKYLINE_RISE = 8;
const RANGE_RISE = -26;
const SUN_ARC_OVERRUN = 0.14;
const MOON_DISC = { x: 12, y: 20, radius: 20.5 };
const SCROLLING_ROOM_HZ = 9;
const SCREEN_STEADY = { startEvery: 1.6, blinkEvery: 0.5, span: 0.44 };
const SCROLL_SETTLE_MS = 500;
const ROOM_CLEAR_SETTLE_SECONDS = 0.1;
const IRIS_HOLE_MARGIN = 1.3;
const WIPE_WALK_REPAINT_EVERY = 2;
const CANDLE_REACH = 26;
const STEAM_BOX = { left: 10, top: 20, width: 20, height: 22 };
const SNORE_BOX = { left: 8, top: 40, width: 16, height: 48 };
const TALLEST_LANDMARK = LANDMARKS.reduce((tallest, landmark) => (landmark.height > tallest.height ? landmark : tallest));
const FAR_TREE_PARALLAX = 0.55;
const FAR_TREE_SCALE = 0.62;
const FAR_TREE_HAZE = 0.34;
const NEAR_TREE_PARALLAX = 0.7;
const HILLS_PARALLAX = 0.4;
const HILLS_TURN_WORLD_X = 1100;
const MEADOW_PARALLAX = 0.86;
const MEADOW_TURN_WORLD_X = 1180;
const SEATTLE_RISE = 34;
const GREAT_WHEEL = { offset: 236, reach: 16 };
const SKYLINE_ROWS = 170;
const LAYER_BASE = 2;
const HAZE = "#8fb3c9";
const REVEAL_FADE = 0.4;
const MIN_TIMELINE_PX = 60;
const IRIS_FROM_FINALE = 0.34;
const ROOM_REVEAL_LEAD = 0.04;
const ROOM_WARM_FINALE = 0.24;
const FOOT_DROP = 3;
const PROP_ROOT_ROW = 2;
const BARK_MARK = { fromSide: 38, top: -14, width: 3, height: 7, gap: 2, color: "#fab387", ink: "#11111b" };
const TELEPORT_COLORS = ["#fde3cf", "#fab387", "#cba6f7", "#ffffff"];

export type WalkEvents = {
  zone(zone: Zone): void;
  inside(inside: boolean): void;
  collected(labels: string[]): void;
  toast(text: string, worldX: number, tone: "gem" | "level"): void;
  progress(progress: number): void;
  unavailable(): void;
};

export type WalkElements = {
  stage: HTMLElement;
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  room: HTMLCanvasElement;
};

function slice(image: HTMLImageElement, width: number, height: number) {
  const frames = (flip: boolean) =>
    Array.from({ length: Math.round(image.width / width) }, (_, i) => {
      const frame = document.createElement("canvas");
      frame.width = width;
      frame.height = height;
      const c = frame.getContext("2d")!;
      if (flip) {
        c.translate(width, 0);
        c.scale(-1, 1);
      }
      c.drawImage(image, i * width, 0, width, height, 0, 0, width, height);
      return frame;
    });
  return { right: frames(false), left: frames(true) };
}

export function startWalk({ stage, view, canvas, room: roomCanvas }: WalkElements, on: WalkEvents) {
  const ctx = canvas.getContext("2d")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const simulation = createSimulation({ reduced });
  let doom: Doom | null = null;
  let doomRequested = false;

  function launchDoom() {
    if (doomRequested) return;
    doomRequested = true;
    import("./doom").then(
      ({ startDoom }) => {
        if (doomRequested) doom = startDoom(view, doomEnded);
      },
      () => doomEnded("failed"),
    );
  }

  function doomEnded(end: DoomEnd) {
    doom = null;
    doomRequested = false;
    terminal.print(end === "quit" ? "back at the cabin." : "doom did not load");
  }

  const terminal = createTerminal((command) => {
    if (command === "doom") launchDoom();
  });
  let cancelled = false;
  let cleanup = () => {};

  loadArt().then(
    (art) => {
      if (!cancelled) cleanup = start(art);
    },
    () => on.unavailable(),
  );

  function start(art: Art) {
    const { rainier } = art;
    const dan = slice(art.dan, DAN_SHEET.width, DAN_SHEET.height);
    const dog = slice(art.mishka, MISHKA_SHEET.width, MISHKA_SHEET.height);
    const cloudWidth = art.clouds.width / CLOUD_KINDS;
    const tintedClouds = document.createElement("canvas");
    tintedClouds.width = art.clouds.width;
    tintedClouds.height = art.clouds.height * 2;
    const tintedCloudsCtx = tintedClouds.getContext("2d")!;
    // Layout, rebuilt on resize. The canvas is scaled by a whole number of
    // device pixels, so art pixels stay square and sharp on any screen.
    let scale = 3;
    let vw = 480;
    let vh = 300;
    let ground = 260;
    let cardSpan = 0;
    const skyCanvas = document.createElement("canvas");
    let skyCtx = skyCanvas.getContext("2d")!;
    const skyTile = document.createElement("canvas");
    skyTile.width = DITHER_PERIOD;
    let skyTileCtx = skyTile.getContext("2d")!;
    let skyImg: ImageData | null = null;
    let skyKey = "";
    let layers: ({ canvas: HTMLCanvasElement; factor: number; top: number; rows: number } & ReturnType<typeof columnsOf>)[] = [];
    const world = document.createElement("canvas");
    let wctx = world.getContext("2d")!;
    let stars: { x: number; y: number; b: number; s: number }[] = [];
    let clouds: { x: number; y: number; kind: number; facing: "left" | "right"; speed: number }[] = [];
    let props: { x: number; kind: number }[] = [];
    let laidOutSize = "";
    let worldTop = 0;
    let lastPaintTop = 0;

    function layout() {
      const w = view.clientWidth;
      const h = view.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const size = `${w} ${h} ${dpr}`;
      if (size === laidOutSize) return;
      laidOutSize = size;
      const device =Math.max(2, Math.min(Math.floor((h * dpr) / 300), Math.floor((w * dpr) / 250)));
      scale = device / dpr;
      vw = Math.ceil(w / scale);
      vh = Math.ceil(h / scale);
      const soil = Math.max(SOIL_DEPTH, Math.ceil(MIN_TIMELINE_PX / scale));
      ground = vh - GROUND_DEPTH - (soil - SOIL_DEPTH);
      view.style.setProperty("--soil", `${soil}`);
      const card = view.querySelector<HTMLElement>(".walk-card");
      if (card) {
        const gutter = Math.min(card.offsetLeft, w - card.offsetLeft - card.offsetWidth);
        const fullWidth = card.offsetWidth + gutter * 2 >= w - 1;
        cardSpan = fullWidth ? 0 : (card.offsetWidth + gutter) / scale;
      }
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.width = `${vw * scale}px`;
      canvas.style.height = `${vh * scale}px`;
      world.width = vw;
      world.height = vh;
      wctx = world.getContext("2d")!;
      skyCanvas.width = vw;
      skyCanvas.height = vh;
      skyCtx = skyCanvas.getContext("2d")!;
      skyTile.height = vh;
      skyTileCtx = skyTile.getContext("2d")!;
      skyImg = skyTileCtx.createImageData(DITHER_PERIOD, vh);
      skyKey = "";
      const travel = WORLD_WIDTH - vw;
      const layer = (factor: number, height: number, paint: (c: CanvasRenderingContext2D, width: number) => void) => {
        const c = document.createElement("canvas");
        c.width = Math.ceil(travel * factor + vw) + 4;
        c.height = height;
        const context = c.getContext("2d")!;
        const top = ground + LAYER_BASE - height;
        context.translate(0, -top);
        paint(context, c.width);
        return { canvas: c, factor, top, rows: height, ...columnsOf(c) };
      };
      const layerXAt = (worldX: number, parallax: number) => Math.round((worldX - vw / 2) * parallax + vw / 2);
      const paintGroves = (c: CanvasRenderingContext2D, width: number, parallax: number, r: () => number, scale: number) => {
        const drawn = { width: Math.round(TREE_SHEET.width * scale), height: Math.round(TREE_SHEET.height * scale) };
        const centredWorldX = (layerX: number) => (layerX - vw / 2) / parallax + vw / 2;
        const clearOfBuildings = (worldX: number) =>
          LANDMARKS.every((landmark) => worldX < landmark.x - TREE_BUILDING_MARGIN || worldX > landmark.x + landmark.width + TREE_BUILDING_MARGIN);
        const wheelX = SEATTLE_LAYER_X + GREAT_WHEEL.offset;
        const wheelOnScreenFrom = Math.max(0, (wheelX - vw) / HILLS_PARALLAX);
        const wheelOnScreenTo = Math.min(travel, wheelX / HILLS_PARALLAX);
        const clearOfWheel = (layerX: number) =>
          layerX + drawn.width + GREAT_WHEEL.reach < wheelX + (parallax - HILLS_PARALLAX) * wheelOnScreenFrom ||
          layerX - GREAT_WHEEL.reach > wheelX + (parallax - HILLS_PARALLAX) * wheelOnScreenTo;
        let tx = FIRST_NEAR_TREE;
        while (tx < width) {
          const surface = surfaceAt(centredWorldX(tx));
          const sparse = surface.name === "sand";
          const grove = sparse ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 5);
          for (let i = 0; i < grove && tx < width; i++) {
            const kind = surface.trees[Math.floor(r() * surface.trees.length)];
            if (clearOfBuildings(centredWorldX(tx)) && clearOfWheel(tx)) {
              c.drawImage(art.trees, kind * TREE_SHEET.width, 0, TREE_SHEET.width, TREE_SHEET.height, Math.round(tx), ground + LAYER_BASE - drawn.height, drawn.width, drawn.height);
            }
            tx += (34 + r() * 40) * scale;
          }
          tx += (sparse ? 240 : 80) + r() * 220;
        }
      };
      layers = [
        layer(SKYLINE_PARALLAX, SKYLINE_ROWS, (c) => {
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
        }),
        layer(HILLS_PARALLAX, art.seattle.height + SEATTLE_RISE + LAYER_BASE, (c, width) => {
          tileThroughTurn(c, art.foothills, layerXAt(HILLS_TURN_WORLD_X, HILLS_PARALLAX), width, ground + LAYER_BASE);
          c.drawImage(art.seattle, SEATTLE_LAYER_X, ground - SEATTLE_RISE - art.seattle.height);
        }),
        layer(FAR_TREE_PARALLAX, TREE_SHEET.height, (c, width) => {
          c.imageSmoothingEnabled = false;
          paintGroves(c, width, FAR_TREE_PARALLAX, rng(34), FAR_TREE_SCALE);
          c.globalCompositeOperation = "source-atop";
          c.globalAlpha = FAR_TREE_HAZE;
          c.fillStyle = HAZE;
          c.fillRect(0, 0, width, vh);
          c.globalAlpha = 1;
          c.globalCompositeOperation = "source-over";
        }),
        layer(NEAR_TREE_PARALLAX, TREE_SHEET.height, (c, width) => paintGroves(c, width, NEAR_TREE_PARALLAX, rng(21), 1)),
        layer(MEADOW_PARALLAX, art.meadow.after.height, (c, width) => tileThroughTurn(c, art.meadow, layerXAt(MEADOW_TURN_WORLD_X, MEADOW_PARALLAX), width, ground + LAYER_BASE)),
      ];
      worldTop = Math.max(0, Math.min(ground + spriteTop(TALLEST_LANDMARK), ...layers.map(({ top }) => top)));
      props = placeProps(rng(9));
      const r = rng(3);
      clouds = [];
      for (let cx = 0; cx < vw + 400; cx += 150 + r() * 170) {
        clouds.push({
          x: cx,
          y: Math.round(ground * (0.04 + r() * 0.34)),
          kind: Math.floor(r() * CLOUD_KINDS),
          facing: r() < 0.5 ? "right" : "left",
          speed: 0.6 + r() * 0.8,
        });
      }
      stars = Array.from({ length: Math.round((vw * ground) / 700) }, () => ({
        x: Math.floor(r() * vw),
        y: Math.floor(r() * ground * 0.62),
        b: 0.4 + r() * 0.6,
        s: r() * 6,
      }));
      view.style.setProperty("--scale", `${scale}`);
    }

    let smokeAt = 0;
    let frame = 0;
    let visible = true;
    const heldKeys = new Set<string>();
    const particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; smoke?: boolean }[] = [];

    function measureTrack() {
      const rect = stage.getBoundingClientRect();
      const pinnedHeight = view.offsetHeight;
      const travel = stage.offsetHeight - pinnedHeight;
      return {
        fraction: clamp(-rect.top / Math.max(1, travel), 0, 1),
        pinned: rect.top <= 1 && rect.bottom >= pinnedHeight - 1,
        top: rect.top + window.scrollY,
        travel,
      };
    }

    function burst(wx: number, wy: number, colors: string[], count: number, power: number) {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const v = power * (0.5 + Math.random() * 0.7);
        particles.push({ x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.6, life: 1, color: colors[i % colors.length] });
      }
    }

    function walkDirection(pinned: boolean): WalkDirection {
      if (!pinned) return 0;
      if (heldKeys.has("ArrowRight") === heldKeys.has("ArrowLeft")) return 0;
      return heldKeys.has("ArrowRight") ? 1 : -1;
    }

    function simulate(now: number) {
      const { fraction, pinned, top, travel } = measureTrack();
      const effects = simulation.step({ fraction, walkDirection: walkDirection(pinned), followsScroll: finger.touched(), viewWidth: vw, cardSpan });
      for (const effect of effects) {
        switch (effect.kind) {
          case "scroll":
            window.scrollTo(0, top + effect.fraction * travel);
            break;
          case "zone":
            on.zone(effect.zone);
            pageRestyled = true;
            break;
          case "collected":
            on.collected(effect.labels);
            break;
          case "progress":
            on.progress(effect.progress);
            break;
          case "gem":
            burst(effect.gem.x, ground - 30, [effect.gem.color, "#ffffff"], 16, 2.2);
            on.toast(effect.gem.label, effect.gem.x, "gem");
            break;
          case "promoted":
            burst(effect.x, ground - 60, ["#ffac42", "#ffe1a0", "#ffffff", "#e96b54"], 40, 3.2);
            on.toast("Promoted to Engineer II", effect.x, "level");
            break;
          default: {
            const _exhaustive: never = effect;
            return _exhaustive;
          }
        }
      }

      const walkers = simulation.view();
      if (walkers.finale >= CONTACT_FINALE && !reduced && !scrolling && !doomRequested) terminal.tick();
      if (walkers.warpLevel > 0) {
        for (const wx of [walkers.dan.x, walkers.mishka.x]) {
          particles.push({ x: wx - 8 + Math.random() * 16, y: ground - Math.random() * 70, vx: 0, vy: -1.6 - Math.random() * 2, life: 0.7, color: TELEPORT_COLORS[Math.floor(Math.random() * TELEPORT_COLORS.length)] });
        }
      }

      // Particles: sparks fall, chimney smoke drifts.
      if (!reduced && now > smokeAt) {
        smokeAt = now + 110 + Math.random() * 110;
        particles.push({ x: CHIMNEY.x + Math.random() * 4, y: ground + CHIMNEY.y, vx: 0.02 + Math.random() * 0.08, vy: -(0.14 + Math.random() * 0.12), life: 1, color: "", smoke: true });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.vx;
        q.y += q.vy;
        if (q.smoke) {
          q.life -= 0.0032;
          q.vx += 0.0009;
        } else {
          q.vy += 0.12;
          q.life -= 0.02;
        }
        if (q.life <= 0) particles.splice(i, 1);
      }
    }

    function cloudLeft(cloud: (typeof clouds)[number], camera: number, drift: number) {
      const span = vw + 400;
      let cx = (cloud.x - camera * 0.08 + drift * cloud.speed) % span;
      if (cx < 0) cx += span;
      return Math.round(cx - 200);
    }

    const layerRows = [0, 0, 0, 0, 0];
    const layerEnds = [0, 0, 0, 0, 0];

    function tintClouds(sky: ReturnType<typeof skyAt>) {
      const { width, height } = art.clouds;
      const c = tintedCloudsCtx;
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, width, height * 2);
      c.drawImage(art.clouds, 0, 0);
      c.setTransform(-1, 0, 0, 1, width, 0);
      c.drawImage(art.clouds, 0, height);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-atop";
      c.globalAlpha = Math.min(0.8, sky.tintAlpha * 2.2);
      c.fillStyle = mix(sky.low, sky.tint, 0.5);
      c.fillRect(0, 0, width, height * 2);
      c.globalAlpha = 1;
    }

    function tinted(img: HTMLImageElement, color: string, alpha: number) {
      const layer = document.createElement("canvas");
      layer.width = img.width;
      layer.height = img.height;
      const c = layer.getContext("2d")!;
      c.drawImage(img, 0, 0);
      c.globalCompositeOperation = "source-atop";
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.fillRect(0, 0, img.width, img.height);
      return layer;
    }
    const alpenglow = tinted(rainier, "#ff8a78", 0.5);
    const moonlit = tinted(rainier, "#1f2350", 0.62);
    const sunArt = {
      halo: sunHalo("#fff3b8"),
      warmHalo: sunHalo("#ff9d5c"),
      sprite: art.sun,
      warm: tinted(art.sun, "#ff6a2c", 0.45),
    };
    const path = buildPath();
    const flecks = soilFlecks(WORLD_WIDTH);
    const puffs = smokePuffs();

    const scenes = {
      wide: createRoomScene(art.rooms.wide, ROOMS.wide, terminal, () => doom?.screen()),
      tall: createRoomScene(art.rooms.tall, ROOMS.tall, terminal, () => doom?.screen()),
    };
    let roomKey = "";
    let wasInside = false;
    let wasCovered = false;
    let wasWarm = false;
    let paintedIris = 0;
    let paintedCamX = 0;
    let wipeFrames = 0;
    let roomClearedAt = -Infinity;
    let pageRestyled = false;
    let scrolling = false;
    let scrolledFrom = 0;
    let scrolledAt = -Infinity;
    let lastScrollY = window.scrollY;
    const rctx = roomCanvas.getContext("2d", { alpha: false })!;

    const roomName = () => (view.clientWidth / view.clientHeight >= WIDE_ROOM_MIN_ASPECT ? "wide" : "tall");

    function irisRadius(iris: number) {
      return iris * iris * (3 - 2 * iris) * Math.hypot(view.clientWidth, view.clientHeight) * 1.15;
    }

    const irisCentre = (camX: number) => ({ x: DOOR.x + DOOR.width / 2 - camX, y: ground + DOOR.y + DOOR.height / 2 });

    function irisCoversView(iris: number, camX: number) {
      if (iris === 0) return false;
      const { x, y } = irisCentre(camX);
      return Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y)) < irisRadius(iris) / scale;
    }

    // The room sits under the walk canvas, which opens this hole onto it. A
    // clip-path on the room instead rebuilds a full-screen mask every frame.
    function openIris(iris: number, camX: number) {
      const { x, y } = irisCentre(camX);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, irisRadius(iris) / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    // Re-projecting a screen costs more than the rest of a paint. Mid-scroll the
    // room's clock loops inside one cursor blink and one editor line, so the
    // screens hold still while the fire and Mishka keep moving.
    function steadyScreenTime(t: number) {
      const { startEvery, blinkEvery, span } = SCREEN_STEADY;
      const start = Math.ceil(Math.floor(scrolledFrom / startEvery) * startEvery / blinkEvery) * blinkEvery;
      return start + (Math.floor(t * SCROLLING_ROOM_HZ) / SCROLLING_ROOM_HZ) % span;
    }

    function movingBoxes(room: (typeof ROOMS)[keyof typeof ROOMS]) {
      const { coffee, snore, snoreDrift } = room;
      return [
        room.fireBox,
        room.main,
        room.side,
        room.mishkaBox,
        room.handsBox,
        room.blink,
        { x: coffee.x - STEAM_BOX.left, y: coffee.y - STEAM_BOX.top, width: STEAM_BOX.width, height: STEAM_BOX.height },
        { x: snore.x + Math.min(snoreDrift, 0) - SNORE_BOX.left, y: snore.y - SNORE_BOX.top, width: Math.abs(snoreDrift) + SNORE_BOX.width, height: SNORE_BOX.height },
        ...room.candles.map(({ x, y }) => ({ x: x - CANDLE_REACH, y: y - CANDLE_REACH, width: CANDLE_REACH * 2, height: CANDLE_REACH * 2 })),
      ];
    }

    function paintRoom(iris: number, t: number) {
      if (iris === 0) return;
      const viewW = view.clientWidth;
      const viewH = view.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const name = roomName();
      const room = ROOMS[name];
      const cover = Math.max(viewW / room.width, viewH / room.height);
      const crisp = Math.ceil(cover * dpr - ROOM_SCALE_SNAP) / dpr;
      const pixel = room.width * crisp * room.subjectSpan <= viewW ? Math.max(crisp, cover) : cover;
      const w = room.width * pixel;
      const h = room.height * pixel;
      const left = Math.round(clamp(roomLeft(room, pixel, viewW), viewW - w, 0));
      const top = Math.round(clamp(viewH * room.anchorY - room.focusY * h, viewH - h, 0));
      const key = `${name} ${w} ${h} ${left} ${top}`;
      if (key !== roomKey) {
        roomKey = key;
        roomCanvas.width = room.width * ROOM_SCALE;
        roomCanvas.height = room.height * ROOM_SCALE;
        roomCanvas.style.width = `${w}px`;
        roomCanvas.style.height = `${h}px`;
        roomCanvas.style.left = `${left}px`;
        roomCanvas.style.top = `${top}px`;
        roomClearedAt = t;
      }

      // The plate is already on the canvas, so a scroll only repaints what moves:
      // a full repaint costs a long task, and nobody reads the room mid-swipe. A
      // frame that restyled the page waits a frame, so the two never share a task.
      const quick = scrolling && t - roomClearedAt > ROOM_CLEAR_SETTLE_SECONDS;
      if (quick && pageRestyled) {
        pageRestyled = false;
        return;
      }
      rctx.save();
      if (quick && iris < 1) {
        const { x, y } = irisCentre(paintedCamX);
        const reach = (irisRadius(iris) * IRIS_HOLE_MARGIN) / scale;
        const toRoom = (cssX: number, cssY: number) => ({ x: ((cssX * scale - left) / pixel) * ROOM_SCALE, y: ((cssY * scale - top) / pixel) * ROOM_SCALE });
        const corner = toRoom(x - reach, y - reach);
        const across = toRoom(x + reach, y + reach);
        rctx.beginPath();
        rctx.rect(corner.x, corner.y, across.x - corner.x, across.y - corner.y);
        rctx.clip();
      }
      rctx.beginPath();
      if (quick) {
        for (const box of movingBoxes(room)) rctx.rect(box.x * ROOM_SCALE, box.y * ROOM_SCALE, box.width * ROOM_SCALE, box.height * ROOM_SCALE);
      } else {
        rctx.rect((-left / pixel) * ROOM_SCALE, (-top / pixel) * ROOM_SCALE, (viewW / pixel) * ROOM_SCALE, (viewH / pixel) * ROOM_SCALE);
      }
      rctx.clip();
      scenes[name].draw(rctx, quick ? steadyScreenTime(t) : t, !reduced, iris < 1);
      rctx.restore();
    }

    function drawContactShadow(x: number, y: number, halfWidth: number, lift: number, presence: number) {
      const shrink = clamp(1 - lift / 60, 0.4, 1);
      const half = Math.round(halfWidth * shrink);
      ctx.fillStyle = "#1a1014";
      ctx.globalAlpha = 0.34 * presence;
      ctx.fillRect(Math.round(x) - half, y - 1, half * 2, 2);
      ctx.fillRect(Math.round(x) - half + 3, y + 1, half * 2 - 6, 1);
      ctx.globalAlpha = 1;
    }

    // Toasts track world positions, so their layer takes the camera as a plain
    // transform. The camera is also published as --cam for tooling, but not while
    // a toast is scrolling past: it inherits, and would restyle the toast each frame.
    const toastLayer = view.querySelector<HTMLElement>(".walk-toasts")!;
    let transformedCamera: number | null = null;
    let publishedCamera: number | null = null;
    function publishCamera(camX: number) {
      const hasToasts = toastLayer.childElementCount > 0;
      if (hasToasts && camX !== transformedCamera) {
        transformedCamera = camX;
        toastLayer.style.transform = `translateX(${-camX * scale}px)`;
      }
      if (camX !== publishedCamera && !(hasToasts && scrolling)) {
        publishedCamera = camX;
        toastLayer.style.setProperty("--cam", `${camX}`);
      }
    }

    // Blits each layer's rows between its highest paint in view and the highest
    // row the solid layers in front of it leave showing. Returns the top row painted.
    function paintLayers(camX: number) {
      let top = vh;
      for (const { landmark } of art.landmarks) {
        const sx = landmark.x - camX;
        if (sx > -landmark.width && sx < vw) top = Math.min(top, ground + spriteTop(landmark));
      }
      let hiddenFrom = vh;
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const left = Math.round(camX * layer.factor);
        let first = layer.rows;
        let solid = 0;
        for (let column = left; column < left + vw; column++) {
          first = Math.min(first, layer.painted[column]);
          solid = Math.max(solid, layer.solid[column]);
        }
        layerRows[i] = first;
        layerEnds[i] = Math.min(layer.rows, hiddenFrom - layer.top);
        hiddenFrom = Math.min(hiddenFrom, layer.top + solid);
        top = Math.min(top, layer.top + first);
      }
      top = Math.max(worldTop, top);
      const cleared = Math.min(top, lastPaintTop);
      wctx.clearRect(0, cleared, vw, vh - cleared);
      lastPaintTop = top;
      layers.forEach((layer, i) => {
        const rows = layerEnds[i] - layerRows[i];
        if (rows > 0) wctx.drawImage(layer.canvas, Math.round(camX * layer.factor), layerRows[i], vw, rows, 0, layer.top + layerRows[i], vw, rows);
      });
      return top;
    }

    function draw(now: number, blend: number) {
      const t = now / 1000;
      if (window.scrollY !== lastScrollY) {
        lastScrollY = window.scrollY;
        if (!scrolling) scrolledFrom = t;
        scrolledAt = now;
      }
      scrolling = now - scrolledAt < SCROLL_SETTLE_MS;
      const { dan: walker, mishka, collected, finale, warpLevel } = simulation.view(blend, measureTrack().fraction);
      const camera = cameraAt(walker.x, vw);
      const camX = Math.round(camera);
      const iris = clamp((finale - IRIS_FROM_FINALE) / 0.5, 0, 1);
      if (iris > 0 !== wasInside) {
        wasInside = iris > 0;
        on.inside(wasInside);
        pageRestyled = true;
      }
      publishCamera(camX);
      // The first paint re-projects both screens, so it gets a quiet frame of its
      // own before the reveal and the wipe, which are heavy enough by themselves.
      const roomWarm = finale >= ROOM_WARM_FINALE;
      if (roomWarm !== wasWarm) {
        wasWarm = roomWarm;
        if (roomWarm) paintRoom(1, t);
      }
      const roomAhead = finale <= IRIS_FROM_FINALE - ROOM_REVEAL_LEAD;
      if (roomCanvas.hidden !== roomAhead) roomCanvas.hidden = roomAhead;
      const covered = irisCoversView(iris, camX);
      if (covered !== wasCovered) {
        wasCovered = covered;
        canvas.style.visibility = covered ? "hidden" : "";
        pageRestyled = true;
      }
      if (covered) {
        paintRoom(iris, t);
        return;
      }
      // While the wipe grows the walk behind it hardly moves, so on most frames
      // it only needs the hole cut wider. Shrinking has to repaint what it uncovers.
      const wipeGrowing = iris > 0 && iris >= paintedIris && camX === paintedCamX;
      paintedIris = iris;
      paintedCamX = camX;
      if (wipeGrowing && (pageRestyled || ++wipeFrames % WIPE_WALK_REPAINT_EVERY)) {
        openIris(iris, camX);
        paintRoom(iris, t);
        return;
      }
      const tod = progressAt(walker.x);
      const sky = skyAt(tod);

      // Sky, cached per step of the day.
      const key = `${Math.round(tod * 300)}`;
      if (key !== skyKey && skyImg) {
        paintSky(skyImg, sky, ground - 10);
        skyTileCtx.putImageData(skyImg, 0, 0);
        skyCtx.fillStyle = skyCtx.createPattern(skyTile, "repeat")!;
        skyCtx.fillRect(0, 0, vw, vh);
        tintClouds(sky);
        stage.style.backgroundColor = mix("#3d2f27", sky.tint, sky.tintAlpha);
        skyKey = key;
      }
      ctx.drawImage(skyCanvas, 0, 0, vw, ground, 0, 0, vw, ground);

      const moonRise = clamp((tod - 0.9) / 0.1, 0, 1);
      const moonLeft = Math.round(vw * 0.18) - art.moon.width / 2;
      const moonTop = Math.round(ground * (0.42 - moonRise * 0.22)) - art.moon.height / 2;
      if (sky.stars > 0.02) {
        ctx.fillStyle = "#fff7e6";
        for (const s of stars) {
          const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 1.7 + s.s);
          const behindMoon = moonRise > 0 && Math.hypot(s.x - moonLeft - MOON_DISC.x, s.y - moonTop - MOON_DISC.y) < MOON_DISC.radius;
          ctx.globalAlpha = clamp(sky.stars * s.b * tw * (behindMoon ? 1 - moonRise : 1), 0, 1);
          ctx.fillRect(s.x, s.y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      const reveal = clamp((walker.x - REVEAL.from) / (REVEAL.to - REVEAL.from), 0, 1);
      const drift = reduced ? 0 : t * 2;
      const cloudAlpha = clamp((tod - 0.06) / 0.06, 0, 1) * (1 - clamp(reveal / REVEAL_FADE, 0, 1));
      if (moonRise > 0) {
        ctx.globalAlpha = moonRise;
        ctx.drawImage(art.moon, moonLeft, moonTop);
        ctx.globalAlpha = 1;
      }

      // The sun's arc runs on past the horizon, so the world hides it at both ends.
      const sunT = (tod - 0.02) / 0.76;
      if (sunT > -SUN_ARC_OVERRUN && sunT < 1 + SUN_ARC_OVERRUN) {
        const sx = Math.round(vw * (0.12 + sunT * 0.8));
        const sy = Math.round(ground - 14 - Math.sin(sunT * Math.PI) * (ground * 0.72));
        drawSun(ctx, sunArt, sx, sy, clamp((sunT - 0.6) / 0.4, 0, 1));
      }

      ctx.globalAlpha = cloudAlpha;
      if (cloudAlpha > 0) {
        const { height } = art.clouds;
        for (const c of clouds) {
          const column = c.facing === "right" ? c.kind : CLOUD_KINDS - 1 - c.kind;
          const row = c.facing === "right" ? 0 : height;
          ctx.drawImage(tintedClouds, column * cloudWidth, row, cloudWidth, height, cloudLeft(c, camera, drift), c.y, cloudWidth, height);
        }
      }
      ctx.globalAlpha = 1;

      // The world: parallax layers, ground, and landmarks, tinted with the time
      // of day so it all sits in the same light.
      const paintTop = paintLayers(camX);
      const worldRows = vh - paintTop;
      paintGround(wctx, path, flecks, camX, vw, ground, vh);
      for (const prop of props) {
        const sx = prop.x - camX;
        if (sx > -PROP_SHEET.width && sx < vw) {
          wctx.drawImage(art.props, prop.kind * PROP_SHEET.width, 0, PROP_SHEET.width, PROP_SHEET.height, Math.round(sx), ground + PROP_ROOT_ROW - PROP_SHEET.height, PROP_SHEET.width, PROP_SHEET.height);
        }
      }
      for (const { landmark, sprite } of art.landmarks) {
        const sx = landmark.x - camX;
        if (sx > -landmark.width && sx < vw) wctx.drawImage(sprite, sx, ground + spriteTop(landmark));
      }

      if (reveal > 0) {
        const eased = reveal * reveal * (3 - 2 * reveal);
        const restTop = ground + REVEAL.baseBelowGround - rainier.height;
        const buried = ground - REVEAL.buriedTop;
        const mountainX = Math.round(vw * REVEAL.summitAt - rainier.width / 2 - eased * REVEAL.drift);
        const mountainY = Math.round(buried + (restTop - buried) * eased);
        const emerged = clamp(reveal / REVEAL_FADE, 0, 1);
        ctx.globalAlpha = emerged;
        ctx.drawImage(rainier, mountainX, mountainY);
        ctx.globalAlpha = clamp((reveal - REVEAL_FADE) / REVEAL_FADE, 0, 1) * Math.sin(Math.PI * Math.min(reveal * 1.15, 1)) * 0.75;
        ctx.drawImage(alpenglow, mountainX, mountainY);
        ctx.globalAlpha = clamp((reveal - 0.55) / 0.45, 0, 1) * 0.6;
        ctx.drawImage(moonlit, mountainX, mountainY);
        ctx.globalAlpha = 1;
      }
      if (sky.tintAlpha > 0.005) {
        wctx.globalCompositeOperation = "source-atop";
        wctx.globalAlpha = sky.tintAlpha;
        wctx.fillStyle = sky.tint;
        wctx.fillRect(0, paintTop, vw, worldRows);
        wctx.globalAlpha = 1;
        wctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(world, 0, paintTop, vw, worldRows, 0, paintTop, vw, worldRows);

      // Light sources sit on top of the tint.
      for (const { landmark, lights } of art.landmarks) {
        if (!lights || !landmark.lights) continue;
        const sx = landmark.x - camX;
        const alpha = Math.max(sky.lights, landmark.lights.daylight);
        if (alpha < 0.02 || sx < -landmark.width || sx > vw) continue;
        ctx.globalAlpha = alpha;
        ctx.drawImage(lights, sx, ground + spriteTop(landmark));
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      for (const { landmark, logo } of art.landmarks) {
        if (!logo || !landmark.sign) continue;
        const { size } = landmark.sign;
        const sx = landmark.x - camX + landmark.sign.x;
        const sy = ground + spriteTop(landmark) + landmark.sign.y;
        if (sx < -40 || sx > vw) continue;
        ctx.drawImage(logo, sx, sy, size, size);
      }
      if (Math.sin(t * 3) > 0.2) {
        ctx.fillStyle = "#ff5a4f";
        ctx.fillRect(BEACON.x - camX - 1, ground + BEACON.y, 3, 2);
      }

      const doorOpen = clamp(finale / 0.12, 0, 1);
      if (doorOpen > 0) {
        const doorX = DOOR.x - camX;
        const doorY = ground + DOOR.y;
        ctx.globalAlpha = doorOpen;
        ctx.fillStyle = "#ffbe5c";
        ctx.fillRect(doorX, doorY, DOOR.width, DOOR.height);
        ctx.fillStyle = "#ffe9b0";
        ctx.fillRect(doorX + 3, doorY + 2, DOOR.width - 6, DOOR.height - 2);
        ctx.globalAlpha = 1;
      }

      // Skills not yet collected.
      for (const gem of GEMS) {
        if (collected.has(gem.label)) continue;
        const sx = Math.round(gem.x - camX);
        if (sx < -10 || sx > vw + 10) continue;
        const bob = reduced ? 0 : Math.round(Math.sin(t * 3 + gem.x) * 2);
        drawGem(ctx, sx, ground - 28 + bob, gem.color);
      }

      if (warpLevel > 0) {
        for (const wx of [walker.x, mishka.x]) {
          const beamX = Math.round(wx - camX);
          ctx.globalAlpha = warpLevel * 0.35;
          ctx.fillStyle = "#cba6f7";
          ctx.fillRect(beamX - 16, 0, 32, ground + 2);
          ctx.globalAlpha = warpLevel * 0.8;
          ctx.fillStyle = "#fde3cf";
          ctx.fillRect(beamX - 6, 0, 12, ground + 2);
        }
        ctx.globalAlpha = 1;
      }

      // The wipe grows out of the door and erases both walkers, opaque until then.
      const presence = 1 - warpLevel;
      const mishkaLeft = Math.round(mishka.x - camera - MISHKA_SHEET.width / 2);
      const mishkaTop = Math.round(ground + FOOT_DROP + spriteTop(MISHKA_SHEET) - mishka.lift) + mishka.depthRows;
      const danLeft = Math.round(walker.x - camera - DAN_SHEET.width / 2);
      const danTop = Math.round(ground + FOOT_DROP + spriteTop(DAN_SHEET) - walker.lift);
      const drawMishka = () => {
        drawContactShadow(mishka.x - camera, ground + FOOT_DROP + 2 + mishka.depthRows, 19, mishka.lift, presence);
        ctx.globalAlpha = presence;
        ctx.drawImage(dog[mishka.facing][mishka.frame], mishkaLeft, mishkaTop);
        if (mishka.barking) {
          const headX = mishkaLeft + (mishka.facing === "right" ? BARK_MARK.fromSide : MISHKA_SHEET.width - BARK_MARK.fromSide - BARK_MARK.width);
          const { top, width, height, gap, color, ink } = BARK_MARK;
          const stroke = (fill: string, grow: number) => {
            ctx.fillStyle = fill;
            ctx.fillRect(headX - grow, mishkaTop + top - grow, width + grow * 2, height + grow * 2);
            ctx.fillRect(headX - grow, mishkaTop + top + height + gap - grow, width + grow * 2, width + grow * 2);
          };
          stroke(ink, 1);
          stroke(color, 0);
        }
      };
      const drawDan = () => {
        drawContactShadow(walker.x - camera, ground + FOOT_DROP + 2, 15, walker.lift, presence);
        ctx.globalAlpha = presence;
        ctx.drawImage(dan[walker.facing][walker.frame], danLeft, danTop);
      };
      if (mishka.inFront) {
        drawDan();
        drawMishka();
      } else {
        drawMishka();
        drawDan();
      }
      ctx.globalAlpha = 1;

      for (const q of particles) {
        if (q.smoke) {
          drawPuff(ctx, puffs, q.x - camX, q.y, 1 - q.life);
          continue;
        }
        ctx.globalAlpha = clamp(q.life * 1.4, 0, 1);
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x - camX), Math.round(q.y), 2, 2);
      }
      ctx.globalAlpha = 1;

      if (iris > 0) openIris(iris, camX);
      paintRoom(iris, t);
    }

    let lastFrame = performance.now();
    const stepClock = createStepClock();

    function loop(now: number) {
      frame = 0;
      finger.frame(now);
      const { steps, blend } = stepClock(now - lastFrame);
      lastFrame = now;
      const doomFullscreen = doom?.fullscreen() ?? false;
      if (!doomFullscreen) for (let step = 0; step < steps; step++) simulate(now);
      if (doom) {
        if (doomFullscreen || (measureTrack().pinned && simulation.view().finale >= CONTACT_FINALE)) doom.pump(now);
        else doom.end("quit");
      }
      draw(now, blend);
      if (visible) frame = requestAnimationFrame(loop);
    }

    function onKey(event: KeyboardEvent) {
      if (doom) {
        doom.keyDown(event);
        return;
      }
      const inControl = event.target instanceof Element && event.target.closest("a, button, input, textarea");
      if (simulation.view().finale >= CONTACT_FINALE && !inControl && !event.metaKey && !event.ctrlKey && !event.altKey && terminal.press(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!measureTrack().pinned) return;
        event.preventDefault();
        heldKeys.add(event.key);
        return;
      }
      if (event.key !== " " && event.key !== "ArrowUp" && event.key !== "w") return;
      if (inControl || !measureTrack().pinned) return;
      event.preventDefault();
      simulation.jump();
    }

    const onKeyUp = (event: KeyboardEvent) => {
      doom?.keyUp(event);
      heldKeys.delete(event.key);
    };
    const releaseKeys = () => heldKeys.clear();

    const finger = driveWithFinger(view, {
      pinned: () => !doom && measureTrack().pinned,
      glides: !reduced,
      dragRatio: () => (measureTrack().travel * FRACTION_PER_WORLD_PX) / scale,
    });
    const ro = new ResizeObserver(() => layout());
    ro.observe(view);
    layout();
    paintRoom(1, performance.now() / 1000);
    rctx.getImageData(0, 0, 1, 1);
    roomCanvas.hidden = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(stage);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseKeys);
    frame = requestAnimationFrame(loop);
    return () => {
      finger.stop();
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseKeys);
    };
  }

  return {
    jump: () => simulation.jump(),
    teleport(destination: Destination) {
      simulation.teleport(destination);
    },
    stop() {
      cancelled = true;
      doomRequested = false;
      doom?.end("quit");
      cleanup();
    },
  };
}
