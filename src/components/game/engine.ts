import {
  GROUND_DEPTH,
  SOIL_DEPTH,
  crescent,
  disc,
  drawGem,
  mix,
  paintGround,
  paintSky,
  rng,
  tileAcross,
  skyAt,
} from "./art";

// The world, in logical pixels. The walk runs left to right through time.
const WORLD = 4260;
export const START = 90;
export const END = 4020;
export const WALK_SHARE = 0.88;

// Sprites in /public/game. Characters are one-row strips of six frames:
// Dan: 0-3 walk, 4 idle, 5 jump. Mishka: 0-3 trot, 4 sit, 5 leap.
const DAN = { src: "/game/dan.png", w: 42, h: 78 };
const DOG = { src: "/game/mishka.png", w: 51, h: 38 };
// Scenery strips: 6 trees (firs, cedar, sapling, maple) and 8 path-side props.
const TREES = { src: "/game/trees.png", w: 110, h: 170, count: 6 };
const PROPS = { src: "/game/props.png", w: 69, h: 40, count: 8 };
// Foreground props scroll faster than the path, so they pass in front.
const CLOUDS = { src: "/game/clouds.png", count: 6 };
const SCENERY = ["cascades", "foothills", "meadow", "seattle"] as const;
const SEATTLE_LAYER_X = 830;
const INTERIORS = {
  wide: { src: "/game/interior.png", w: 643, h: 361, focusX: 0.62, focusY: 0.5, anchorY: 0.5, subjectSpan: 0.45, fire: { x: 0.868, y: 0.55 }, coffee: { x: 0.612, y: 0.455 } },
  tall: { src: "/game/interior-tall.png", w: 360, h: 640, focusX: 0.5, focusY: 0.63, anchorY: 0.62, subjectSpan: 0.75, fire: { x: 0.872, y: 0.634 }, coffee: { x: 0.415, y: 0.56 } },
};
const WIDE_ROOM_MIN_ASPECT = 1.1;
const REVEAL = { from: 3380, to: 3930, summitAt: 0.56, baseBelowGround: 6, buriedTop: 70, drift: 34 };
const FOREGROUND = 1.18;
const FIRST_NEAR_TREE = 340;

type Sign = { logo: string; x: number; y: number; size: number; plate?: boolean };
type Landmark = { name: string; x: number; lights?: boolean; always?: number; sign?: Sign };

// `lights` adds the night-light layer; `always` keeps some of it on by day.
const LANDMARKS: Landmark[] = [
  { name: "sign", x: 150 },
  { name: "lab", x: 640, lights: true, always: 0.3, sign: { logo: "pnnl", x: 186, y: 30, size: 20, plate: true } },
  { name: "warehouse", x: 1500, lights: true, sign: { logo: "chewy-sign", x: 287, y: 13, size: 16 } },
  { name: "tower", x: 2350, lights: true, sign: { logo: "atlassian", x: 16, y: 2, size: 24, plate: true } },
  { name: "labsnow", x: 3150, lights: true, always: 0.45, sign: { logo: "vannevar", x: 158, y: 66, size: 24, plate: true } },
  { name: "cabin", x: 3950, lights: true },
];
const CHIMNEY = { x: 3950 + 48, y: -122 };
const BEACON = { x: 3150 + 226, y: -130 };
const DOOR = { x: 3950 + 62, y: -122 + 81 - 1, w: 16, h: 33 };

// Where each stop's card shows, in world x, and the landmark it describes.
const ZONES = [
  { id: "pnnl", from: 540, to: 1000, landmark: "lab" },
  { id: "chewy", from: 1400, to: 1860, landmark: "warehouse" },
  { id: "atlassian", from: 2250, to: 2620, landmark: "tower" },
  { id: "vannevar", from: 3050, to: 3480, landmark: "labsnow" },
];

export const TIMELINE = [
  { label: "Start", year: "Back to", x: START },
  { label: "PNNL", year: "2017", x: 770 },
  { label: "Chewy", year: "Jan 2022", x: 1640 },
  { label: "Atlassian", year: "Sep 2022", x: 2420 },
  { label: "Vannevar", year: "2025", x: 3270 },
  { label: "Contact", year: "Now", x: END },
];

// Skills sit where they were used, per the verified work history.
export const GEMS = [
  { x: 560, label: "D3", color: "#f2994a" },
  { x: 640, label: "ASP.NET", color: "#a98bf0" },
  { x: 750, label: "Python", color: "#ffd43b" },
  { x: 860, label: "Java", color: "#f2715a" },
  { x: 1420, label: "React", color: "#61dafb" },
  { x: 2260, label: "C#", color: "#c08cff" },
  { x: 2330, label: "REST APIs", color: "#7ee0a1" },
  { x: 3070, label: "Agentic AI", color: "#ffac42" },
  // What he writes day to day (from About); not tied to an employer.
  { x: 3790, label: "TypeScript", color: "#5b9dff" },
  { x: 3830, label: "Node.js", color: "#79c96b" },
  { x: 3870, label: "AWS", color: "#ffb84d" },
];
const PROMOTION_X = 2480;
const MIN_TIMELINE_PX = 60;
const KEY_WALK_SPEED = 2.6;
const MAX_WALK_SPEED = 4.5;
const MAX_STRIDE_STEP = 3;
const SIM_STEP_MS = 1000 / 60;
const TELEPORT_MS = 720;
const TELEPORT_COLORS = ["#fde3cf", "#fab387", "#cba6f7", "#ffffff"];


export type Side = "left" | "right";
export type ToastTone = "gem" | "level";

export type WalkEvents = {
  zone(zone: string): void;
  side(side: Side): void;
  collected(labels: string[]): void;
  toast(text: string, worldX: number, tone: ToastTone): void;
  progress(progress: number): void;
};

export type WalkElements = {
  stage: HTMLElement;
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  room: HTMLCanvasElement;
};


const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Frames of a strip as separate canvases, plus mirrored copies for walking left.
function slice(img: HTMLImageElement, w: number, h: number) {
  const frames = (flip: boolean) =>
    Array.from({ length: Math.round(img.width / w) }, (_, i) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      if (flip) {
        x.translate(w, 0);
        x.scale(-1, 1);
      }
      x.drawImage(img, i * w, 0, w, h, 0, 0, w, h);
      return c;
    });
  return { right: frames(false), left: frames(true) };
}

export function startWalk({ stage, view, canvas, room: roomCanvas }: WalkElements, on: WalkEvents) {
  let triggerJump = () => {};
  let triggerTeleport = (top: number) => window.scrollTo(0, top);
  const ctx = canvas.getContext("2d")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cancelled = false;
  let cleanup = () => {};

  Promise.all([
    load(DAN.src),
    load(DOG.src),
    load("/game/rainier.png"),
    load(TREES.src),
    load(PROPS.src),
    load(CLOUDS.src),
    ...SCENERY.map((name) => load(`/game/${name}.png`)),
    load(INTERIORS.wide.src),
    load(INTERIORS.tall.src),
    ...LANDMARKS.map((l) => load(`/game/${l.name}.png`)),
    ...LANDMARKS.map((l) => (l.lights ? load(`/game/${l.name}-lights.png`) : Promise.resolve(null))),
    ...LANDMARKS.map((l) => (l.sign ? load(`/game/logos/${l.sign.logo}.png`) : Promise.resolve(null))),
  ]).then((images) => {
    if (cancelled) return;
    const [danImg, dogImg, rainier, treesImg, propsImg, cloudsImg, cascades, foothills, meadow, seattle, interior, interiorTall] = images as HTMLImageElement[];
    const sprites = LANDMARKS.map((_, i) => images[12 + i] as HTMLImageElement);
    const lightImgs = LANDMARKS.map((_, i) => images[12 + LANDMARKS.length + i] as HTMLImageElement | null);
    const signImgs = LANDMARKS.map((_, i) => images[12 + LANDMARKS.length * 2 + i] as HTMLImageElement | null);
    cleanup = start(danImg, dogImg, rainier, treesImg, propsImg, cloudsImg, { cascades, foothills, meadow, seattle }, { wide: interior, tall: interiorTall }, sprites, lightImgs, signImgs);
  });

  function start(
    danImg: HTMLImageElement,
    dogImg: HTMLImageElement,
    rainier: HTMLImageElement,
    treesImg: HTMLImageElement,
    propsImg: HTMLImageElement,
    cloudsImg: HTMLImageElement,
    scenery: Record<(typeof SCENERY)[number], HTMLImageElement>,
    rooms: Record<keyof typeof INTERIORS, HTMLImageElement>,
    sprites: HTMLImageElement[],
    lightImgs: (HTMLImageElement | null)[],
    signImgs: (HTMLImageElement | null)[]
  ) {
    const dan = slice(danImg, DAN.w, DAN.h);
    const dog = slice(dogImg, DOG.w, DOG.h);
    const cloudW = cloudsImg.width / CLOUDS.count;
    const cloudH = cloudsImg.height;
    const cloudSprites = slice(cloudsImg, cloudW, cloudH);

    // Layout, rebuilt on resize. The canvas is scaled by a whole number of
    // device pixels, so art pixels stay square and sharp on any screen.
    let scale = 3;
    let vw = 480;
    let vh = 300;
    let ground = 260;
    let skyImg: ImageData | null = null;
    let skyKey = "";
    let layers: { canvas: HTMLCanvasElement; factor: number }[] = [];
    const world = document.createElement("canvas");
    let wctx = world.getContext("2d")!;
    let stars: { x: number; y: number; b: number; s: number }[] = [];
    let clouds: { x: number; y: number; kind: number; side: "right" | "left"; speed: number }[] = [];
    const cloudLayer = document.createElement("canvas");
    let cctx = cloudLayer.getContext("2d")!;
    let props: { x: number; kind: number }[] = [];
    const fg = document.createElement("canvas");
    let fctx = fg.getContext("2d")!;

    function layout() {
      const w = view.clientWidth;
      const h = view.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const device = Math.max(2, Math.min(Math.floor((h * dpr) / 300), Math.floor((w * dpr) / 250)));
      scale = device / dpr;
      vw = Math.ceil(w / scale);
      vh = Math.ceil(h / scale);
      const soil = Math.max(SOIL_DEPTH, Math.ceil(MIN_TIMELINE_PX / scale));
      ground = vh - GROUND_DEPTH - (soil - SOIL_DEPTH);
      view.style.setProperty("--soil", `${soil}`);
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.width = `${vw * scale}px`;
      canvas.style.height = `${vh * scale}px`;
      world.width = vw;
      world.height = vh;
      wctx = world.getContext("2d")!;
      fg.width = vw;
      fg.height = vh;
      fctx = fg.getContext("2d")!;
      cloudLayer.width = vw;
      cloudLayer.height = vh;
      cctx = cloudLayer.getContext("2d")!;
      skyImg = ctx.createImageData(vw, vh);
      skyKey = "";
      const travel = WORLD - vw;
      const layer = (factor: number, paint: (c: CanvasRenderingContext2D, width: number) => void) => {
        const c = document.createElement("canvas");
        c.width = Math.ceil(travel * factor + vw) + 4;
        c.height = vh;
        paint(c.getContext("2d")!, c.width);
        return { canvas: c, factor };
      };
      layers = [
        layer(0.12, (c, width) => {
          tileAcross(c, scenery.cascades, width, ground - 40);
          }),
        layer(0.4, (c, width) => {
          tileAcross(c, scenery.foothills, width, ground + 2);
          c.drawImage(scenery.seattle, SEATTLE_LAYER_X, ground - 34 - scenery.seattle.height);
        }),
        layer(0.7, (c, width) => {
          // Groves of real trees; firs most often, the odd maple.
          const r = rng(21);
          let tx = FIRST_NEAR_TREE;
          while (tx < width) {
            const grove = 2 + Math.floor(r() * 5);
            for (let i = 0; i < grove && tx < width; i++) {
              const n = r();
              const kind = n < 0.3 ? 0 : n < 0.55 ? 1 : n < 0.72 ? 2 : n < 0.85 ? 3 : n < 0.93 ? 4 : 5;
              c.drawImage(treesImg, kind * TREES.w, 0, TREES.w, TREES.h, Math.round(tx), ground + 2 - TREES.h, TREES.w, TREES.h);
              tx += 34 + r() * 40;
            }
            tx += 80 + r() * 220;
          }
        }),
        layer(0.86, (c, width) => tileAcross(c, scenery.meadow, width, ground + 2)),
      ];
      // Path-side props, placed once in foreground coordinates.
      props = [];
      const pr = rng(9);
      for (let px = 260; px < WORLD * FOREGROUND + vw; px += 150 + pr() * 260) {
        props.push({ x: Math.round(px), kind: Math.floor(pr() * PROPS.count) });
      }
      const r = rng(3);
      clouds = [];
      for (let cx = 0; cx < vw + 400; cx += 150 + r() * 170) {
        clouds.push({
          x: cx,
          y: Math.round(ground * (0.04 + r() * 0.34)),
          kind: Math.floor(r() * CLOUDS.count),
          side: r() < 0.5 ? "right" : "left",
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

    // State.
    let x = START;
    let vx = 0;
    let facing: "right" | "left" = "right";
    let stride = 0;
    let jumpY = 0;
    let jumpV = 0;
    let dogX = START - 46;
    let dogFacing: "right" | "left" = "right";
    let dogStride = 0;
    let dogJumpY = 0;
    let dogJumpV = 0;
    let dogJumpAt = 0;
    let idleSince = performance.now();
    let smokeAt = 0;
    let lastZone = "";
    let finale = 0;
    let warp: { start: number; top: number; moved: boolean } | null = null;
    let warpLevel = 0;
    let snapNext = false;
    let lastProgress = -1;
    let frame = 0;
    let visible = true;
    let first = true;
    const got = new Set<string>();
    const heldKeys = new Set<string>();
    let promoted = false;
    const particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; smoke?: boolean }[] = [];

    function scrollTarget() {
      const rect = stage.getBoundingClientRect();
      const travel = stage.offsetHeight - window.innerHeight;
      const p = clamp(-rect.top / Math.max(1, travel), 0, 1);
      return { p, target: START + Math.min(p / WALK_SHARE, 1) * (END - START), pinned: rect.top <= 1 && rect.bottom >= window.innerHeight - 1 };
    }


    function burst(wx: number, wy: number, colors: string[], count: number, power: number) {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const v = power * (0.5 + Math.random() * 0.7);
        particles.push({ x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.6, life: 1, color: colors[i % colors.length] });
      }
    }

    function jump() {
      if (jumpY > 0.5) return;
      jumpV = 5.6;
      dogJumpAt = performance.now() + 150;
    }
    triggerJump = jump;

    function teleport(top: number) {
      if (reduced) {
        window.scrollTo(0, top);
        return;
      }
      heldKeys.clear();
      warp = { start: performance.now(), top, moved: false };
    }
    triggerTeleport = teleport;

    function walkHeldKeys() {
      const direction = Number(heldKeys.has("ArrowRight")) - Number(heldKeys.has("ArrowLeft"));
      if (!direction || !scrollTarget().pinned) return;
      const travel = stage.offsetHeight - window.innerHeight;
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const distance = (direction * KEY_WALK_SPEED * travel) / (END - START);
      window.scrollTo(0, clamp(window.scrollY + distance, top, top + travel));
    }

    function simulate(now: number) {
      walkHeldKeys();
      warpLevel = 0;
      if (warp) {
        const t = (now - warp.start) / TELEPORT_MS;
        warpLevel = clamp(Math.sin(Math.min(t, 1) * Math.PI), 0, 1);
        if (t >= 0.5 && !warp.moved) {
          window.scrollTo(0, warp.top);
          warp.moved = true;
          snapNext = true;
        }
        if (t >= 1) warp = null;
        for (const wx of [x, dogX]) {
          particles.push({ x: wx - 8 + Math.random() * 16, y: ground - Math.random() * 70, vx: 0, vy: -1.6 - Math.random() * 2, life: 0.7, color: TELEPORT_COLORS[Math.floor(Math.random() * TELEPORT_COLORS.length)] });
        }
      }
      const { p, target } = scrollTarget();
      finale = clamp((p - WALK_SHARE) / (1 - WALK_SHARE), 0, 1);
      const snapping = first || snapNext || Math.abs(target - x) > 560;
      if (first && !reduced && target <= START + 1) {
        // Opening: Dan and Mishka walk in from off screen to the trailhead.
        x = START - 130;
        dogX = START - 190;
        first = false;
      }
      const dx = target - x;
      if (reduced || first || snapNext || Math.abs(dx) > 560) {
        x = target;
        dogX = target - 46;
        vx = 0;
        first = false;
        snapNext = false;
      } else {
        vx = clamp(dx * 0.12, -MAX_WALK_SPEED, MAX_WALK_SPEED);
        if (x < START) vx = Math.min(vx, 1.6);
        if (Math.abs(dx) < 0.3) vx = 0;
        x += vx;
      }
      if (vx > 0.05) facing = "right";
      else if (vx < -0.05) facing = "left";
      if (Math.abs(vx) > 0.05) {
        idleSince = now;
        stride += Math.min(Math.abs(vx), MAX_STRIDE_STEP);
      }

      if (jumpV !== 0 || jumpY > 0) {
        jumpY += jumpV;
        jumpV -= 0.32;
        if (jumpY <= 0) {
          jumpY = 0;
          jumpV = 0;
        }
      }

      // Mishka keeps a lead length behind, trotting to catch up.
      const dogTarget = finale > 0 ? x : x + (facing === "right" ? -46 : 46);
      const ddx = dogTarget - dogX;
      const dogV = clamp(ddx * 0.075, -MAX_WALK_SPEED - 0.5, MAX_WALK_SPEED + 0.5);
      if (Math.abs(ddx) > 0.4) {
        dogX += dogV;
        dogStride += Math.min(Math.abs(dogV), MAX_STRIDE_STEP);
        if (Math.abs(dogV) > 0.1) dogFacing = dogV > 0 ? "right" : "left";
      } else dogFacing = facing;
      if (dogJumpAt && now >= dogJumpAt) {
        dogJumpV = 4.8;
        dogJumpAt = 0;
      }
      if (dogJumpV !== 0 || dogJumpY > 0) {
        dogJumpY += dogJumpV;
        dogJumpV -= 0.32;
        if (dogJumpY <= 0) {
          dogJumpY = 0;
          dogJumpV = 0;
        }
      }

      // Collect skills and the promotion as the path passes them.
      for (const gem of GEMS) {
        if (!got.has(gem.label) && x >= gem.x) {
          got.add(gem.label);
          on.collected(GEMS.filter((g) => got.has(g.label)).map((g) => g.label));
          if (!snapping) {
            burst(gem.x, ground - 30, [gem.color, "#ffffff"], 16, 2.2);
            on.toast(gem.label, gem.x, "gem");
          }
        }
      }
      if (!promoted && x >= PROMOTION_X) {
        promoted = true;
        if (!snapping) {
          burst(x, ground - 60, ["#ffac42", "#ffe1a0", "#ffffff", "#e96b54"], 40, 3.2);
          on.toast("Promoted to Engineer II", x, "level");
        }
      }

      const found = x < 400 ? null : ZONES.find((z) => x >= z.from && x <= z.to);
      const zoneNow = finale > 0.72 ? "contact" : x < 400 ? "intro" : found?.id ?? "between";
      if (zoneNow !== lastZone) {
        lastZone = zoneNow;
        on.zone(zoneNow);
        if (zoneNow === "contact") on.side("left");
        else if (found) {
          const i = LANDMARKS.findIndex((l) => l.name === found.landmark);
          const camX = clamp(x - vw * 0.36, 0, WORLD - vw);
          const centre = LANDMARKS[i].x + sprites[i].width / 2 - camX;
          on.side(centre > vw * 0.5 ? "left" : "right");
        }
      }
      const pr = Math.round(((x - START) / (END - START)) * 1000) / 1000;
      if (pr !== lastProgress) {
        lastProgress = pr;
        on.progress(clamp(pr, 0, 1));
      }

      // Particles: sparks fall, chimney smoke drifts.
      if (!reduced && now > smokeAt) {
        smokeAt = now + 320;
        particles.push({ x: CHIMNEY.x + Math.random() * 4, y: ground + CHIMNEY.y, vx: 0.12 + Math.random() * 0.08, vy: -0.32, life: 1, color: "#b9b4cc", smoke: true });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.vx;
        q.y += q.vy;
        if (q.smoke) {
          q.life -= 0.004;
          q.vx += 0.003;
        } else {
          q.vy += 0.12;
          q.life -= 0.02;
        }
        if (q.life <= 0) particles.splice(i, 1);
      }
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

    let roomKey = "";
    const rctx = roomCanvas.getContext("2d")!;

    function paintRoom(iris: number, t: number, camX: number) {
      roomCanvas.hidden = iris === 0;
      if (iris === 0) return;
      const viewW = view.clientWidth;
      const viewH = view.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const name = viewW / viewH >= WIDE_ROOM_MIN_ASPECT ? "wide" : "tall";
      const room = INTERIORS[name];
      const cover = Math.max(viewW / room.w, viewH / room.h);
      const crisp = Math.ceil(cover * dpr) / dpr;
      const pixel = room.w * crisp * room.subjectSpan <= viewW ? crisp : cover;
      const w = room.w * pixel;
      const h = room.h * pixel;
      const left = Math.round(clamp(viewW / 2 - room.focusX * w, viewW - w, 0));
      const top = Math.round(clamp(viewH * room.anchorY - room.focusY * h, viewH - h, 0));
      const key = `${name} ${w} ${h} ${left} ${top}`;
      if (key !== roomKey) {
        roomKey = key;
        roomCanvas.width = room.w;
        roomCanvas.height = room.h;
        roomCanvas.style.width = `${w}px`;
        roomCanvas.style.height = `${h}px`;
        roomCanvas.style.left = `${left}px`;
        roomCanvas.style.top = `${top}px`;
      }

      const doorX = (DOOR.x + DOOR.w / 2 - camX) * scale;
      const doorY = viewH - (vh - (ground + DOOR.y + DOOR.h / 2)) * scale;
      const radius = iris * iris * (3 - 2 * iris) * Math.hypot(viewW, viewH) * 1.15;
      roomCanvas.style.clipPath = `circle(${radius}px at ${doorX - left}px ${doorY - top}px)`;

      rctx.drawImage(rooms[name], 0, 0);
      if (reduced) return;
      const fireX = room.fire.x * room.w;
      const fireY = room.fire.y * room.h;
      rctx.globalCompositeOperation = "lighter";
      rctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 9) * Math.sin(t * 3.7);
      disc(rctx, Math.round(fireX), Math.round(fireY), 52, "#ff9a3c");
      rctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < 9; i++) {
        const rise = (t * 16 + i * 37) % 46;
        rctx.globalAlpha = 1 - rise / 46;
        rctx.fillStyle = i % 2 ? "#ffd27a" : "#ff8a3c";
        rctx.fillRect(Math.round(fireX + Math.sin(t * 2 + i * 2.1) * 12), Math.round(fireY - rise), 1, 1);
      }
      for (let i = 0; i < 5; i++) {
        const rise = (t * 7 + i * 5) % 22;
        rctx.globalAlpha = 0.5 * (1 - rise / 22);
        rctx.fillStyle = "#f4efe6";
        rctx.fillRect(Math.round(room.coffee.x * room.w + Math.sin(t * 1.6 + i) * 2), Math.round(room.coffee.y * room.h - rise), 1, 1);
      }
      rctx.globalAlpha = 1;
    }

    function draw(now: number) {
      const t = now / 1000;
      const travel = WORLD - vw;
      const camX = Math.round(clamp(x - vw * 0.36, 0, travel));
      const tod = clamp((x - START) / (END - START), 0, 1);
      const sky = skyAt(tod);

      // Sky, cached per step of the day.
      const key = `${Math.round(tod * 300)}`;
      if (key !== skyKey && skyImg) {
        paintSky(skyImg, sky, ground - 10);
        stage.style.backgroundColor = mix("#3d2f27", sky.tint, sky.tintAlpha);
        skyKey = key;
      }
      if (skyImg) ctx.putImageData(skyImg, 0, 0);

      if (sky.stars > 0.02) {
        for (const s of stars) {
          const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 1.7 + s.s);
          ctx.globalAlpha = clamp(sky.stars * s.b * tw, 0, 1);
          ctx.fillStyle = "#fff7e6";
          ctx.fillRect(s.x, s.y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      const reveal = clamp((x - REVEAL.from) / (REVEAL.to - REVEAL.from), 0, 1);
      if (reveal > 0) {
        const eased = reveal * reveal * (3 - 2 * reveal);
        const restTop = ground + REVEAL.baseBelowGround - rainier.height;
        const buried = ground - REVEAL.buriedTop;
        const mountainX = Math.round(vw * REVEAL.summitAt - rainier.width / 2 - eased * REVEAL.drift);
        const mountainY = Math.round(buried + (restTop - buried) * eased);
        ctx.drawImage(rainier, mountainX, mountainY);
        ctx.globalAlpha = Math.sin(Math.PI * Math.min(reveal * 1.15, 1)) * 0.75;
        ctx.drawImage(alpenglow, mountainX, mountainY);
        ctx.globalAlpha = clamp((reveal - 0.55) / 0.45, 0, 1) * 0.6;
        ctx.drawImage(moonlit, mountainX, mountainY);
        ctx.globalAlpha = 1;
      }
      const sunT = clamp((tod - 0.02) / 0.76, 0, 1);
      if (sunT > 0 && sunT < 1) {
        const sx = Math.round(vw * (0.12 + sunT * 0.8));
        const sy = Math.round(ground - 14 - Math.sin(sunT * Math.PI) * (ground * 0.72));
        const late = clamp((sunT - 0.6) / 0.4, 0, 1);
        ctx.globalAlpha = 0.2;
        disc(ctx, sx, sy, 15, mix("#fff4cf", "#ffb36b", late));
        ctx.globalAlpha = 1;
        disc(ctx, sx, sy, 9, mix("#fff8dc", "#ffc27a", late));
      }
      if (tod > 0.9) {
        const mt = clamp((tod - 0.9) / 0.1, 0, 1);
        ctx.globalAlpha = mt;
        crescent(ctx, Math.round(vw * 0.18), Math.round(ground * (0.42 - mt * 0.22)), 10, "#f1eedf");
        ctx.globalAlpha = 1;
      }

      const drift = reduced ? 0 : t * 2;
      cctx.clearRect(0, 0, vw, vh);
      for (const c of clouds) {
        const span = vw + 400;
        let cx = (c.x - camX * 0.08 + drift * c.speed) % span;
        if (cx < 0) cx += span;
        cctx.drawImage(cloudSprites[c.side][c.kind], Math.round(cx - 200), c.y);
      }
      cctx.globalCompositeOperation = "source-atop";
      cctx.globalAlpha = Math.min(0.8, sky.tintAlpha * 2.2);
      cctx.fillStyle = mix(sky.low, sky.tint, 0.5);
      cctx.fillRect(0, 0, vw, vh);
      cctx.globalAlpha = 1;
      cctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = clamp((tod - 0.06) / 0.06, 0, 1);
      ctx.drawImage(cloudLayer, 0, 0);
      ctx.globalAlpha = 1;

      // The world: parallax layers, ground, and landmarks, then tinted with
      // the time of day so it all sits in the same light.
      wctx.clearRect(0, 0, vw, vh);
      for (const l of layers) wctx.drawImage(l.canvas, -Math.round(camX * l.factor), 0);
      paintGround(wctx, camX, vw, ground, vh);
      LANDMARKS.forEach((lm, i) => {
        const img = sprites[i];
        const sx = lm.x - camX;
        if (sx > -img.width && sx < vw) wctx.drawImage(img, sx, ground + 2 - img.height);
      });
      if (sky.tintAlpha > 0.005) {
        wctx.globalCompositeOperation = "source-atop";
        wctx.globalAlpha = sky.tintAlpha;
        wctx.fillStyle = sky.tint;
        wctx.fillRect(0, 0, vw, vh);
        wctx.globalAlpha = 1;
        wctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(world, 0, 0);

      // Light sources sit on top of the tint.
      LANDMARKS.forEach((lm, i) => {
        const light = lightImgs[i];
        if (!light) return;
        const sx = lm.x - camX;
        const a = Math.max(sky.lights, lm.always ?? 0);
        if (a < 0.02 || sx < -light.width || sx > vw) return;
        ctx.globalAlpha = a;
        ctx.drawImage(light, sx, ground + 2 - light.height);
      });
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      LANDMARKS.forEach((lm, i) => {
        const logo = signImgs[i];
        if (!logo || !lm.sign) return;
        const sx = lm.x - camX + lm.sign.x;
        const sy = ground + 2 - sprites[i].height + lm.sign.y;
        if (sx < -40 || sx > vw) return;
        if (lm.sign.plate) {
          ctx.fillStyle = "#1e1e2e";
          ctx.fillRect(sx - 2, sy - 2, lm.sign.size + 4, lm.sign.size + 4);
        }
        ctx.drawImage(logo, sx, sy, lm.sign.size, lm.sign.size);
      });
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
        ctx.fillRect(doorX, doorY, DOOR.w, DOOR.h);
        ctx.fillStyle = "#ffe9b0";
        ctx.fillRect(doorX + 3, doorY + 2, DOOR.w - 6, DOOR.h - 2);
        ctx.globalAlpha = 1;
      }

      // Skills not yet collected.
      for (const gem of GEMS) {
        if (got.has(gem.label)) continue;
        const sx = Math.round(gem.x - camX);
        if (sx < -10 || sx > vw + 10) continue;
        const bob = reduced ? 0 : Math.round(Math.sin(t * 3 + gem.x) * 2);
        drawGem(ctx, sx, ground - 28 + bob, gem.color);
      }

      if (warpLevel > 0) {
        for (const wx of [x, dogX]) {
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

      // Mishka, then Dan.
      const resting = finale === 0 && now - idleSince > 1200 && Math.abs(dogX - (x + (facing === "right" ? -46 : 46))) < 2;
      const dogFrame = dogJumpY > 0 ? 5 : resting ? 4 : Math.floor(dogStride / 8) % 4;
      ctx.globalAlpha = (1 - clamp((finale - 0.2) / 0.14, 0, 1)) * (1 - warpLevel);
      ctx.drawImage(dog[dogFacing][dogFrame], Math.round(dogX - camX - DOG.w / 2), Math.round(ground + 2 - DOG.h - dogJumpY));

      ctx.globalAlpha = (1 - clamp((finale - 0.1) / 0.14, 0, 1)) * (1 - warpLevel);
      const moving = Math.abs(vx) > 0.05;
      const danFrame = jumpY > 0 ? 5 : moving ? Math.floor(stride / 11) % 4 : 4;
      const breathe = !moving && jumpY === 0 && !reduced && Math.sin(t * 2.2) > 0.6 ? 1 : 0;
      ctx.drawImage(dan[facing][danFrame], Math.round(x - camX - DAN.w / 2), Math.round(ground + 2 - DAN.h - jumpY + breathe));
      ctx.globalAlpha = 1;

      // Foreground props, in the same light as the world.
      fctx.clearRect(0, 0, vw, vh);
      const fx = camX * FOREGROUND;
      for (const p of props) {
        const sx = p.x - fx;
        if (sx < -PROPS.w || sx > vw) continue;
        fctx.drawImage(propsImg, p.kind * PROPS.w, 0, PROPS.w, PROPS.h, Math.round(sx), ground + 15 - PROPS.h, PROPS.w, PROPS.h);
      }
      if (sky.tintAlpha > 0.005) {
        fctx.globalCompositeOperation = "source-atop";
        fctx.globalAlpha = sky.tintAlpha;
        fctx.fillStyle = sky.tint;
        fctx.fillRect(0, 0, vw, vh);
        fctx.globalAlpha = 1;
        fctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(fg, 0, 0);

      for (const q of particles) {
        ctx.globalAlpha = q.smoke ? q.life * 0.4 : clamp(q.life * 1.4, 0, 1);
        ctx.fillStyle = q.color;
        const size = q.smoke ? 2 + Math.round((1 - q.life) * 3) : 2;
        ctx.fillRect(Math.round(q.x - camX), Math.round(q.y), size, size);
      }
      ctx.globalAlpha = 1;

      paintRoom(clamp((finale - 0.34) / 0.5, 0, 1), t, camX);

      // Hand the camera to the DOM so toasts can track world positions.
      view.style.setProperty("--cam", `${camX}`);
    }

    let lastFrame = performance.now();
    let unsimulatedMs = 0;

    function loop(now: number) {
      frame = 0;
      unsimulatedMs += Math.min(now - lastFrame, 100);
      lastFrame = now;
      while (unsimulatedMs >= SIM_STEP_MS) {
        simulate(now);
        unsimulatedMs -= SIM_STEP_MS;
      }
      draw(now);
      if (visible) frame = requestAnimationFrame(loop);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!scrollTarget().pinned) return;
        event.preventDefault();
        heldKeys.add(event.key);
        return;
      }
      if (event.key !== " " && event.key !== "ArrowUp" && event.key !== "w") return;
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, textarea")) return;
      if (!scrollTarget().pinned) return;
      event.preventDefault();
      jump();
    }

    const onKeyUp = (event: KeyboardEvent) => heldKeys.delete(event.key);
    const releaseKeys = () => heldKeys.clear();

    const ro = new ResizeObserver(() => layout());
    ro.observe(view);
    layout();
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
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseKeys);
    };
  }

  return {
    jump: () => triggerJump(),
    teleport: (top: number) => triggerTeleport(top),
    stop() {
      cancelled = true;
      cleanup();
    },
  };
}
