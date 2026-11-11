import type { RoomArt } from "./assets";
import { createFire, type Hearth } from "./fire";
import type { Terminal } from "./terminal";

type Ctx = CanvasRenderingContext2D;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };

export type RoomLayout = {
  width: number;
  height: number;
  main: Box;
  side: Box;
  fireBox: Box;
  hearth: Omit<Hearth, "width" | "height">;
  handsBox: Box;
  typingFrames: number;
  mishkaBox: Box;
  stars: number[][];
  lake: number[][];
  mishkaFrames: number;
  city: number[][];
  coffee: Point;
  blink: Box;
  candles: Point[];
  snore: Point;
  snoreDrift: number;
};

export type GameScreen = { picture: HTMLCanvasElement; frame: number };

export const ROOM_SCALE = 2;

const NIGHT_SKY = "#101a4a";
const RIPPLE_HIGH = "#6f93dc";
const RIPPLE_LOW = "#3f5fae";
const RIPPLE_SPEED = 2.2;
const RIPPLE_SPACING = 26;
const RIPPLE_LENGTH = 3;
const RIPPLE_ROW_GAP = 4;
const GLINT_EVERY = 6;
const NIGHT_WATER = "#16204f";
const FIRE_FPS = 12;
const ROOM_FPS = 30;
const OPENING_ROOM_FPS = 15;
const BREATH_FPS = 2.4;
const BLINK_EVERY_SECONDS = 5.3;
const DOUBLE_BLINK_EVERY_SECONDS = 5.6;
const BLINK_SECONDS = 0.14;
const EYELID = "#e8b888";
const LASHES = "#4a2c20";
const FINGER_TAP_SECONDS = 0.08;
const STEAM_HEIGHT = 18;

const SNORE_Z = ["111", "001", "010", "100", "111"];

function drawZ(ctx: Ctx, x: number, y: number, size: number) {
  SNORE_Z.forEach((row, line) => {
    [...row].forEach((dot, column) => {
      if (dot === "1") ctx.fillRect(x + column * size, y + line * size, size, size);
    });
  });
}

const lightSprites = new Map<number, HTMLCanvasElement>();

function lightSprite(radius: number) {
  const known = lightSprites.get(radius);
  if (known) return known;
  const size = radius * ROOM_SCALE;
  const sprite = document.createElement("canvas");
  sprite.width = size * 2;
  sprite.height = size * 2;
  const ctx = sprite.getContext("2d")!;
  const light = ctx.createRadialGradient(size, size, 0, size, size, size);
  light.addColorStop(0, "rgba(255, 150, 60, 1)");
  light.addColorStop(0.35, "rgba(255, 130, 50, 0.45)");
  light.addColorStop(0.7, "rgba(255, 110, 40, 0.12)");
  light.addColorStop(1, "rgba(255, 100, 30, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size * 2, size * 2);
  lightSprites.set(radius, sprite);
  return sprite;
}

function softLight(ctx: Ctx, x: number, y: number, radius: number, strength: number) {
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = strength;
  ctx.drawImage(lightSprite(radius), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawCandle(ctx: Ctx, { x, y }: Point, t: number, seed: number) {
  const step = Math.floor(t * 8 + seed * 3);
  const height = 4 + [0, 1, 2, 1][step % 4];
  const sway = [0, 0, 1, 0, -1, 0][step % 6];
  ctx.fillStyle = "#3b2a22";
  ctx.fillRect(x, y, 1, 2);
  ctx.fillStyle = "#ff9a2e";
  ctx.fillRect(x - 1, y - 2, 3, 2);
  ctx.fillRect(x, y - height + 1, 1, height - 1);
  ctx.fillStyle = "#ffd76a";
  ctx.fillRect(x, y - height + 2, 1, height - 2);
  ctx.fillRect(x + sway, y - height, 1, 2);
  ctx.fillStyle = "#fff6c9";
  ctx.fillRect(x, y - 2, 1, 2);
  softLight(ctx, x, y - 3, 24, 0.2 + 0.04 * Math.sin(t * 7 + seed));
}

export function drawSteam(ctx: Ctx, { x, y }: Point, t: number) {
  ctx.fillStyle = "#f4efe6";
  for (let wisp = 0; wisp < 2; wisp++) {
    const sway = wisp ? 1 : -1;
    for (let rise = 0; rise < STEAM_HEIGHT; rise++) {
      const travel = rise / STEAM_HEIGHT;
      const flow = rise * 0.55 - t * 2.6 + wisp * 2.1;
      if (Math.sin(flow * 1.7) < travel * 1.2 - 0.9) continue;
      ctx.globalAlpha = 0.8 * (1 - travel) ** 1.5;
      const curl = Math.sin(flow) * (1 + travel * 3.5) * sway;
      const column = Math.round(x + sway * 1.5 + curl);
      ctx.fillRect(column, y - rise, 1, 1);
      if (travel < 0.5 && Math.cos(flow) > 0.6) ctx.fillRect(column + sway, y - rise, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSnore(ctx: Ctx, { x, y }: Point, drift: number, t: number) {
  ctx.fillStyle = "#cdd6f4";
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.28 + i / 3) % 1;
    ctx.globalAlpha = Math.sin(Math.PI * phase) * 0.9;
    drawZ(ctx, Math.round(x + phase * drift + Math.sin(phase * 6) * 2), Math.round(y - phase * 30), phase > 0.5 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
}

function drawWindow(ctx: Ctx, stars: number[][], city: number[][], t: number) {
  stars.forEach(([x, y], i) => {
    const twinkle = Math.sin(t * (0.9 + (i % 5) * 0.31) + i * 1.7);
    if (twinkle < -0.2) {
      ctx.fillStyle = NIGHT_SKY;
      ctx.fillRect(x, y, 1, 1);
    } else if (twinkle > 0.5) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, 1, 1);
      if (i % GLINT_EVERY === 0) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
  });
  city.forEach(([x, y], i) => {
    const flicker = Math.sin(t * (0.5 + (i % 7) * 0.27) + i * 2.3);
    if (flicker < -0.3) {
      ctx.fillStyle = NIGHT_WATER;
      ctx.fillRect(x, y, 1, 1);
    } else if (flicker > 0.4) {
      ctx.fillStyle = "#ffe9a8";
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

function drawBlink(ctx: Ctx, blink: Box, t: number) {
  const closed = t % BLINK_EVERY_SECONDS < BLINK_SECONDS || t % DOUBLE_BLINK_EVERY_SECONDS < BLINK_SECONDS;
  if (!closed) return;
  ctx.fillStyle = EYELID;
  ctx.fillRect(blink.x, blink.y, blink.width, blink.height);
  ctx.fillStyle = LASHES;
  ctx.fillRect(blink.x, blink.y + blink.height - 1, blink.width, 1);
}

function drawLake(ctx: Ctx, lake: number[][], t: number) {
  lake.forEach(([x, y, width], i) => {
    if (y % RIPPLE_ROW_GAP) return;
    const drift = t * (RIPPLE_SPEED + (i % 3) * 1.1) + i * 37;
    ctx.fillStyle = i % 3 ? RIPPLE_LOW : RIPPLE_HIGH;
    for (let dash = 0; dash < width / RIPPLE_SPACING; dash++) {
      const offset = Math.floor((drift + dash * RIPPLE_SPACING) % width);
      ctx.fillRect(x + offset, y, Math.min(RIPPLE_LENGTH, width - offset), 1);
    }
  });
}

// The room as painted, with everything in it that moves except the two monitors,
// which room-screens.ts draws at a finer grain on canvases of their own.
export function createRoomScene(art: RoomArt, room: RoomLayout, terminal: Terminal) {
  let keystrokes = 0;
  let lastKeyAt = -1;
  let tap = 0;
  let paintedTick = -1;
  let paintedWidth = 0;
  let paintedStill: string | null = null;

  function drawStripFrame(ctx: Ctx, strip: HTMLImageElement, box: Box, frame: number) {
    ctx.drawImage(strip, frame * box.width, 0, box.width, box.height, box.x, box.y, box.width, box.height);
  }

  const fire = createFire({ ...room.hearth, width: room.fireBox.width, height: room.fireBox.height });
  const flames = document.createElement("canvas");
  flames.width = room.fireBox.width;
  flames.height = room.fireBox.height;
  const flamesCtx = flames.getContext("2d")!;
  const flamePixels = flamesCtx.createImageData(flames.width, flames.height);
  let fireTick = -1;

  function drawFire(ctx: Ctx, t: number, animate: boolean) {
    const tick = animate ? Math.floor(t * FIRE_FPS) : 0;
    if (tick !== fireTick) {
      if (fireTick !== -1) fire.step();
      fireTick = tick;
      fire.paint(flamePixels.data);
      flamesCtx.putImageData(flamePixels, 0, 0);
    }
    ctx.drawImage(flames, room.fireBox.x, room.fireBox.y);
  }

  let scaledPlate: HTMLCanvasElement | null = null;

  function plateAtRoomScale() {
    if (scaledPlate) return scaledPlate;
    scaledPlate = document.createElement("canvas");
    scaledPlate.width = room.width * ROOM_SCALE;
    scaledPlate.height = room.height * ROOM_SCALE;
    const ctx = scaledPlate.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.plate, 0, 0, scaledPlate.width, scaledPlate.height);
    return scaledPlate;
  }

  return {
    stoke: fire.stoke,
    wiped() {
      paintedStill = null;
    },
    draw(ctx: Ctx, t: number, animate: boolean, opening: boolean) {
      const tick = Math.floor(t * (opening ? OPENING_ROOM_FPS : ROOM_FPS));
      if (tick === paintedTick && ctx.canvas.width === paintedWidth) return;
      paintedTick = tick;
      paintedWidth = ctx.canvas.width;
      const screen = terminal.screen();
      const still = animate ? null : `${screen.keystrokes} ${screen.keystrokes !== keystrokes || t - lastKeyAt < FINGER_TAP_SECONDS}`;
      if (still !== null && still === paintedStill) return;
      paintedStill = still;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(plateAtRoomScale(), 0, 0);
      ctx.setTransform(ROOM_SCALE, 0, 0, ROOM_SCALE, 0, 0);

      drawFire(ctx, t, animate);
      const flicker = animate ? 0.02 * Math.sin(t * 5) * Math.sin(t * 2.3) : 0;
      softLight(ctx, room.fireBox.x + room.fireBox.width / 2, room.fireBox.y + room.fireBox.height * 0.65, 170, 0.1 + flicker);

      if (animate) {
        drawLake(ctx, room.lake, t);
        drawWindow(ctx, room.stars, room.city, t);
        const breath = Math.floor(t * BREATH_FPS) % room.mishkaFrames;
        drawStripFrame(ctx, art.mishka, room.mishkaBox, breath);
      }
      for (const [seed, candle] of room.candles.entries()) drawCandle(ctx, candle, animate ? t : 0, seed);

      if (screen.keystrokes !== keystrokes) {
        keystrokes = screen.keystrokes;
        lastKeyAt = t;
        const next = (Math.imul(keystrokes, 0x9e3779b1) >>> 16) % room.typingFrames;
        tap = next === tap ? (next + 1) % room.typingFrames : next;
      }
      if (animate) drawBlink(ctx, room.blink, t);
      if (lastKeyAt >= 0 && t - lastKeyAt < FINGER_TAP_SECONDS) drawStripFrame(ctx, art.hands, room.handsBox, tap);
      if (animate) drawSteam(ctx, room.coffee, t);
      if (animate) drawSnore(ctx, room.snore, room.snoreDrift, t);
    },
  };
}
