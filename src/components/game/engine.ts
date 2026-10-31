import { GROUND_DEPTH, SOIL_DEPTH, disc, drawGem, drawSun, mix, paintGround, paintSky, rng, skyAt, tileAcross } from "./art";
import { buildPath } from "./path";
import { CLOUD_KINDS, DAN_SHEET, MISHKA_SHEET, PROP_SHEET, TREE_SHEET, loadArt, type Art } from "./assets";
import layouts from "./room-layouts.json";
import { ROOM_SCALE, createRoomScene } from "./room-scene";
import { CONTACT_FINALE, cameraAt, createSimulation, type Side, type WalkDirection, type Zone } from "./simulation";
import { createTerminal } from "./terminal";
import { clamp, progressAt, type Destination } from "./track";
import { BEACON, CHIMNEY, DOOR, GEMS, WORLD_WIDTH, spriteTop } from "./world";

const SEATTLE_LAYER_X = 830;
const ROOMS = {
  wide: {
    ...layouts.wide,
    focusX: 0.7,
    focusY: 0.55,
    anchorY: 0.55,
    subjectSpan: 0.56,
    coffee: { x: 539, y: 235 },
    candles: [{ x: 688, y: 123 }, { x: 705, y: 131 }],
    snore: { x: 709, y: 304 },
  },
  tall: {
    ...layouts.tall,
    focusX: 0.58,
    focusY: 0.63,
    anchorY: 0.62,
    subjectSpan: 0.66,
    coffee: { x: 179, y: 487 },
    candles: [{ x: 391, y: 372 }, { x: 407, y: 383 }],
    snore: { x: 349, y: 616 },
  },
};
const WIDE_ROOM_MIN_ASPECT = 1.1;
const REVEAL = { from: 3380, to: 3930, summitAt: 0.56, baseBelowGround: 6, buriedTop: 70, drift: 34 };
const FOREGROUND = 1.18;
const FIRST_NEAR_TREE = 340;
const MIN_TIMELINE_PX = 60;
const FOOT_DROP = 3;
const SIM_STEP_MS = 1000 / 60;
const TELEPORT_COLORS = ["#fde3cf", "#fab387", "#cba6f7", "#ffffff"];

export type WalkEvents = {
  zone(zone: Zone, side: Side | null): void;
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
  const terminal = createTerminal();
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
    const cloudSprites = slice(art.clouds, art.clouds.width / CLOUD_KINDS, art.clouds.height);
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
    let clouds: { x: number; y: number; kind: number; facing: "left" | "right"; speed: number }[] = [];
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
      const travel = WORLD_WIDTH - vw;
      const layer = (factor: number, paint: (c: CanvasRenderingContext2D, width: number) => void) => {
        const c = document.createElement("canvas");
        c.width = Math.ceil(travel * factor + vw) + 4;
        c.height = vh;
        paint(c.getContext("2d")!, c.width);
        return { canvas: c, factor };
      };
      layers = [
        layer(0.12, (c, width) => {
          tileAcross(c, art.cascades, width, ground - 40);
        }),
        layer(0.4, (c, width) => {
          tileAcross(c, art.foothills, width, ground + 2);
          c.drawImage(art.seattle, SEATTLE_LAYER_X, ground - 34 - art.seattle.height);
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
              c.drawImage(art.trees, kind * TREE_SHEET.width, 0, TREE_SHEET.width, TREE_SHEET.height, Math.round(tx), ground + spriteTop(TREE_SHEET), TREE_SHEET.width, TREE_SHEET.height);
              tx += 34 + r() * 40;
            }
            tx += 80 + r() * 220;
          }
        }),
        layer(0.86, (c, width) => tileAcross(c, art.meadow, width, ground + 2)),
      ];
      // Path-side props, placed once in foreground coordinates.
      props = [];
      const pr = rng(9);
      for (let px = 260; px < WORLD_WIDTH * FOREGROUND + vw; px += 150 + pr() * 260) {
        props.push({ x: Math.round(px), kind: Math.floor(pr() * PROP_SHEET.count) });
      }
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
      const travel = stage.offsetHeight - window.innerHeight;
      return {
        fraction: clamp(-rect.top / Math.max(1, travel), 0, 1),
        pinned: rect.top <= 1 && rect.bottom >= window.innerHeight - 1,
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
      const effects = simulation.step({ fraction, walkDirection: walkDirection(pinned), viewWidth: vw });
      for (const effect of effects) {
        switch (effect.kind) {
          case "scroll":
            window.scrollTo(0, top + effect.fraction * travel);
            break;
          case "zone":
            on.zone(effect.zone, effect.side);
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
      if (walkers.finale > 0) terminal.tick();
      if (walkers.warpLevel > 0) {
        for (const wx of [walkers.dan.x, walkers.mishka.x]) {
          particles.push({ x: wx - 8 + Math.random() * 16, y: ground - Math.random() * 70, vx: 0, vy: -1.6 - Math.random() * 2, life: 0.7, color: TELEPORT_COLORS[Math.floor(Math.random() * TELEPORT_COLORS.length)] });
        }
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
    const warmSun = tinted(art.sun, "#ff6a2c", 0.45);
    const path = buildPath();

    const scenes = {
      wide: createRoomScene(art.rooms.wide, ROOMS.wide, terminal),
      tall: createRoomScene(art.rooms.tall, ROOMS.tall, terminal),
    };
    let roomKey = "";
    const rctx = roomCanvas.getContext("2d")!;

    function paintRoom(iris: number, t: number, camX: number) {
      roomCanvas.hidden = iris === 0;
      if (iris === 0) return;
      const viewW = view.clientWidth;
      const viewH = view.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const name = viewW / viewH >= WIDE_ROOM_MIN_ASPECT ? "wide" : "tall";
      const room = ROOMS[name];
      const cover = Math.max(viewW / room.width, viewH / room.height);
      const crisp = Math.ceil(cover * dpr) / dpr;
      const pixel = room.width * crisp * room.subjectSpan <= viewW ? crisp : cover;
      const w = room.width * pixel;
      const h = room.height * pixel;
      const left = Math.round(clamp(viewW / 2 - room.focusX * w, viewW - w, 0));
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
      }

      const doorX = (DOOR.x + DOOR.width / 2 - camX) * scale;
      const doorY = viewH - (vh - (ground + DOOR.y + DOOR.height / 2)) * scale;
      const radius = iris * iris * (3 - 2 * iris) * Math.hypot(viewW, viewH) * 1.15;
      roomCanvas.style.clipPath = `circle(${radius}px at ${doorX - left}px ${doorY - top}px)`;

      scenes[name].draw(rctx, t, !reduced);
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

    function draw(now: number) {
      const t = now / 1000;
      const { dan: walker, mishka, collected, finale, warpLevel } = simulation.view();
      const camX = Math.round(cameraAt(walker.x, vw));
      const tod = progressAt(walker.x);
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
      const reveal = clamp((walker.x - REVEAL.from) / (REVEAL.to - REVEAL.from), 0, 1);
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
        drawSun(ctx, art.sun, warmSun, sx, sy, clamp((sunT - 0.6) / 0.4, 0, 1));
      }
      if (tod > 0.9) {
        const mt = clamp((tod - 0.9) / 0.1, 0, 1);
        ctx.globalAlpha = mt;
        ctx.drawImage(art.moon, Math.round(vw * 0.18) - art.moon.width / 2, Math.round(ground * (0.42 - mt * 0.22)) - art.moon.height / 2);
        ctx.globalAlpha = 1;
      }

      const drift = reduced ? 0 : t * 2;
      cctx.clearRect(0, 0, vw, vh);
      for (const c of clouds) {
        const span = vw + 400;
        let cx = (c.x - camX * 0.08 + drift * c.speed) % span;
        if (cx < 0) cx += span;
        cctx.drawImage(cloudSprites[c.facing][c.kind], Math.round(cx - 200), c.y);
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
      paintGround(wctx, path, camX, vw, ground, vh);
      for (const { landmark, sprite } of art.landmarks) {
        const sx = landmark.x - camX;
        if (sx > -landmark.width && sx < vw) wctx.drawImage(sprite, sx, ground + spriteTop(landmark));
      }
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
        const { size, plate } = landmark.sign;
        const sx = landmark.x - camX + landmark.sign.x;
        const sy = ground + spriteTop(landmark) + landmark.sign.y;
        if (sx < -40 || sx > vw) continue;
        if (plate) {
          ctx.fillStyle = "#1e1e2e";
          ctx.fillRect(sx - 2, sy - 2, size + 4, size + 4);
        }
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

      // Mishka, then Dan.
      const dogPresence = (1 - clamp((finale - 0.2) / 0.14, 0, 1)) * (1 - warpLevel);
      const danPresence = (1 - clamp((finale - 0.1) / 0.14, 0, 1)) * (1 - warpLevel);
      drawContactShadow(mishka.x - camX, ground + FOOT_DROP + 2, 19, mishka.lift, dogPresence);
      drawContactShadow(walker.x - camX, ground + FOOT_DROP + 2, 15, walker.lift, danPresence);
      ctx.globalAlpha = dogPresence;
      ctx.drawImage(dog[mishka.facing][mishka.frame], Math.round(mishka.x - camX - MISHKA_SHEET.width / 2), Math.round(ground + FOOT_DROP + spriteTop(MISHKA_SHEET) - mishka.lift));

      ctx.globalAlpha = danPresence;
      ctx.drawImage(dan[walker.facing][walker.frame], Math.round(walker.x - camX - DAN_SHEET.width / 2), Math.round(ground + FOOT_DROP + spriteTop(DAN_SHEET) - walker.lift));
      ctx.globalAlpha = 1;

      // Foreground props, in the same light as the world.
      fctx.clearRect(0, 0, vw, vh);
      const fx = camX * FOREGROUND;
      for (const p of props) {
        const sx = p.x - fx;
        if (sx < -PROP_SHEET.width || sx > vw) continue;
        fctx.drawImage(art.props, p.kind * PROP_SHEET.width, 0, PROP_SHEET.width, PROP_SHEET.height, Math.round(sx), ground + 15 - PROP_SHEET.height, PROP_SHEET.width, PROP_SHEET.height);
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
    jump: () => simulation.jump(),
    teleport(destination: Destination) {
      simulation.teleport(destination);
    },
    stop() {
      cancelled = true;
      cleanup();
    },
  };
}
