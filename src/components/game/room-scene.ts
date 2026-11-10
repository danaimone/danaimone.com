import type { RoomArt } from "./assets";
import simulationSource from "./simulation.ts?raw";
import { PROMPT, type Terminal } from "./terminal";

type Ctx = CanvasRenderingContext2D;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type ScreenCorners = { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point };

export type RoomLayout = {
  width: number;
  height: number;
  main: Box;
  side: Box;
  mainCorners: ScreenCorners;
  sideCorners: ScreenCorners;
  fireBox: Box;
  fireFrames: number;
  handsBox: Box;
  handFrames: number;
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
const TERMINAL_FONT = 2;
const TERMINAL_ROW = 12;
const TERMINAL_TOP = 2;
const TERMINAL_MARGIN = 4;
const PILL_HEIGHT = 12;
const PILL_PADDING = 2;
const EDITOR_ROW = 6;
const EDITOR_SCROLL_SECONDS = 1.6;
const FIRE_FPS = 9;
const ROOM_FPS = 30;
const OPENING_ROOM_FPS = 15;
const BREATH_FPS = 2.4;
const BLINK_EVERY_SECONDS = 5.3;
const DOUBLE_BLINK_EVERY_SECONDS = 5.6;
const BLINK_SECONDS = 0.14;
const EYELID = "#e8b888";
const LASHES = "#4a2c20";
const HANDS_LINGER_SECONDS = 0.18;
const STEAM_HEIGHT = 18;
const SCREEN_GRID = 3;
const SCREEN_DETAIL = 2;

const MOCHA = {
  base: "#1e1e2e",
  mantle: "#181825",
  surface: "#313244",
  overlay: "#6c7086",
  overlay2: "#9399b2",
  text: "#cdd6f4",
  green: "#a6e3a1",
  mauve: "#cba6f7",
  blue: "#89b4fa",
  peach: "#fab387",
  yellow: "#f9e2af",
  pink: "#f5c2e7",
};

const GLYPHS: Record<string, string> = {
  a: "25755", b: "65656", c: "34443", d: "65556", e: "74647", f: "74644", g: "34753", h: "55755", i: "72227",
  j: "11152", k: "55655", l: "44447", m: "77555", n: "65555", o: "25552", p: "65644", q: "25573", r: "65765",
  s: "34216", t: "72222", u: "55557", v: "55522", w: "55577", x: "55255", y: "55222", z: "71247",
  "0": "75557", "1": "26227", "2": "61247", "3": "61216", "4": "55711", "5": "74616", "6": "34757", "7": "71222",
  "8": "75757", "9": "75716", ".": "00002", ",": "00021", "-": "00700", _: "00007", "/": "11224", ":": "02020",
  ">": "42124", "<": "12421", "@": "25743", "?": "61202", "!": "22202", "=": "07070", "+": "02720", "*": "05250",
  "#": "57575", "'": "22000", '"': "55000", "~": "03600", "(": "24442", ")": "42224", "{": "32623", "}": "62326",
  "→": "21712", "[": "64446", "]": "62226", ";": "02021", "&": "25353", "|": "22222", "%": "51245", $: "36736", "`": "42000",
};

const KEYWORDS = /^(const|let|function|return|if|else|for|of|type|export|import|from|new|switch|case|default)\b/;

const EDITOR_LINES = simulationSource.split("\n");

function drawText(ctx: Ctx, text: string, x: number, y: number, size = 1) {
  [...text.toLowerCase()].forEach((letter, column) => {
    const glyph = GLYPHS[letter];
    if (!glyph) return;
    [...glyph].forEach((row, line) => {
      const bits = Number(row);
      for (let bit = 0; bit < 3; bit++) {
        if (bits & (4 >> bit)) ctx.fillRect(x + (column * 4 + bit) * size, y + line * size, size, size);
      }
    });
  });
}

function drawCode(ctx: Ctx, line: string, x: number, y: number, columns: number) {
  let column = 0;
  let rest = line.slice(0, columns);
  while (rest) {
    const word = rest.match(/^[A-Za-z_$][\w$]*/)?.[0];
    const text = rest.match(/^"[^"]*"?/)?.[0] ?? rest.match(/^\d+\.?\d*/)?.[0] ?? word ?? rest[0];
    if (text.startsWith('"')) ctx.fillStyle = MOCHA.green;
    else if (/^\d/.test(text)) ctx.fillStyle = MOCHA.peach;
    else if (KEYWORDS.test(text)) ctx.fillStyle = MOCHA.mauve;
    else if (word && rest[word.length] === "(") ctx.fillStyle = MOCHA.blue;
    else if (word && /^[A-Z]/.test(word)) ctx.fillStyle = MOCHA.yellow;
    else ctx.fillStyle = MOCHA.text;
    drawText(ctx, text, x + column * 4, y);
    column += text.length;
    rest = rest.slice(text.length);
  }
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

function drawSteam(ctx: Ctx, { x, y }: Point, t: number) {
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
    drawText(ctx, "z", Math.round(x + phase * drift + Math.sin(phase * 6) * 2), Math.round(y - phase * 30), phase > 0.5 ? 2 : 1);
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

// A screen's text is laid out on its own grid, finer than the room's canvas: the
// monitors are too narrow for a terminal row at one glyph pixel per art pixel, and
// a finer room canvas is the costliest thing the door wipe paints.
function createScreen({ width, height }: Box, corners: ScreenCorners, box: Box, mask: HTMLImageElement) {
  const flat = document.createElement("canvas");
  flat.width = width * SCREEN_GRID * SCREEN_DETAIL;
  flat.height = height * SCREEN_GRID * SCREEN_DETAIL;
  const flatCtx = flat.getContext("2d")!;
  flatCtx.scale(SCREEN_DETAIL, SCREEN_DETAIL);
  const canvas = document.createElement("canvas");
  canvas.width = width * ROOM_SCALE;
  canvas.height = height * ROOM_SCALE;
  const ctx = canvas.getContext("2d")!;
  const place = ({ x, y }: Point) => ({ x: (x - box.x) * ROOM_SCALE, y: (y - box.y) * ROOM_SCALE });
  const topLeft = place(corners.topLeft);
  const topRight = place(corners.topRight);
  const bottomLeft = place(corners.bottomLeft);
  const bottomRight = place(corners.bottomRight);
  return {
    canvas,
    flatCtx,
    flatWidth: width * SCREEN_GRID,
    flatHeight: height * SCREEN_GRID,
    finish(source: HTMLCanvasElement = flat) {
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = MOCHA.base;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = source === flat;
      ctx.imageSmoothingQuality = "high";
      const destinationWidth = Math.ceil(topRight.x - topLeft.x);
      const sourceColumn = source.width / destinationWidth;
      for (let column = 0; column < destinationWidth; column++) {
        const across = column / destinationWidth;
        const top = topLeft.y + (topRight.y - topLeft.y) * across;
        const bottom = bottomLeft.y + (bottomRight.y - bottomLeft.y) * across;
        ctx.drawImage(source, column * sourceColumn, 0, sourceColumn, source.height, topLeft.x + column, top, 1, bottom - top);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    },
  };
}

function paintStatusBar(ctx: Ctx, y: number, width: number, clock: string) {
  const textWidth = (text: string) => text.length * 4 * TERMINAL_FONT;
  const segment = (text: string, background: string, left: number, right: number) => {
    ctx.fillStyle = background;
    ctx.fillRect(left, y, right - left, PILL_HEIGHT);
    ctx.fillStyle = MOCHA.base;
    drawText(ctx, text, left + PILL_PADDING, y + 1, TERMINAL_FONT);
  };
  const user = textWidth("dan") + PILL_PADDING * 2;
  const path = user + textWidth("~/cabin") + PILL_PADDING * 2;
  const clockLeft = width - textWidth(clock) - PILL_PADDING * 2;
  segment("dan", MOCHA.overlay2, 0, user);
  segment("~/cabin", MOCHA.peach, user, path);
  ctx.fillStyle = MOCHA.surface;
  ctx.fillRect(path, y, clockLeft - path, PILL_HEIGHT);
  segment(clock, MOCHA.pink, clockLeft, width);
}

function paintTerminal(ctx: Ctx, width: number, height: number, rows: string[], cursorOn: boolean, clock: string) {
  ctx.fillStyle = MOCHA.base;
  ctx.fillRect(0, 0, width, height);
  const history = rows.slice(0, -1);
  const input = rows.at(-1) ?? PROMPT;
  history.forEach((row, index) => {
    ctx.fillStyle = row.startsWith(PROMPT) ? MOCHA.green : MOCHA.text;
    drawText(ctx, row, TERMINAL_MARGIN, TERMINAL_TOP + index * TERMINAL_ROW, TERMINAL_FONT);
  });
  const barY = TERMINAL_TOP + history.length * TERMINAL_ROW;
  paintStatusBar(ctx, barY, width, clock);
  const inputY = barY + PILL_HEIGHT + 2;
  ctx.fillStyle = MOCHA.green;
  drawText(ctx, PROMPT, TERMINAL_MARGIN, inputY, TERMINAL_FONT);
  ctx.fillStyle = MOCHA.text;
  drawText(ctx, input.slice(PROMPT.length), TERMINAL_MARGIN + PROMPT.length * 4 * TERMINAL_FONT, inputY, TERMINAL_FONT);
  if (cursorOn) {
    ctx.fillRect(TERMINAL_MARGIN + input.length * 4 * TERMINAL_FONT, inputY, 3 * TERMINAL_FONT, 5 * TERMINAL_FONT);
  }
}

function paintEditor(ctx: Ctx, width: number, height: number, firstLine: number) {
  const gutter = 18;
  const rows = Math.floor((height - EDITOR_ROW - 1) / EDITOR_ROW);
  const columns = Math.floor((width - gutter - 2) / 4);
  ctx.fillStyle = MOCHA.base;
  ctx.fillRect(0, 0, width, height);
  for (let row = 0; row < rows; row++) {
    const number = (firstLine + row) % EDITOR_LINES.length;
    ctx.fillStyle = row === 3 ? MOCHA.yellow : MOCHA.overlay;
    drawText(ctx, String(number + 1).padStart(3, " "), 2, 1 + row * EDITOR_ROW);
    drawCode(ctx, EDITOR_LINES[number].trimEnd(), gutter, 1 + row * EDITOR_ROW, columns);
  }
  ctx.fillStyle = MOCHA.surface;
  ctx.fillRect(0, height - EDITOR_ROW - 1, width, EDITOR_ROW + 1);
  ctx.fillStyle = MOCHA.green;
  ctx.fillRect(0, height - EDITOR_ROW - 1, 26, EDITOR_ROW + 1);
  ctx.fillStyle = MOCHA.mantle;
  drawText(ctx, "normal", 1, height - EDITOR_ROW);
  ctx.fillStyle = MOCHA.text;
  drawText(ctx, "simulation.ts", 30, height - EDITOR_ROW);
}

export function createRoomScene(art: RoomArt, room: RoomLayout, terminal: Terminal, gameScreen: () => GameScreen | null | undefined) {
  const main = createScreen(room.main, room.mainCorners, room.main, art.screen);
  const side = createScreen(room.side, room.sideCorners, room.side, art.side);
  let keystrokes = 0;
  let lastKeyAt = -1;
  let paintedMain = "";
  let paintedGameFrame = 0;
  let paintedLine = -1;
  let paintedTick = -1;
  let paintedWidth = 0;

  function drawStripFrame(ctx: Ctx, strip: HTMLImageElement, box: Box, frame: number) {
    ctx.drawImage(strip, frame * box.width, 0, box.width, box.height, box.x, box.y, box.width, box.height);
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
    draw(ctx: Ctx, t: number, animate: boolean, opening: boolean) {
      const tick = Math.floor(t * (opening ? OPENING_ROOM_FPS : ROOM_FPS));
      if (tick === paintedTick && ctx.canvas.width === paintedWidth) return;
      paintedTick = tick;
      paintedWidth = ctx.canvas.width;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(plateAtRoomScale(), 0, 0);
      ctx.setTransform(ROOM_SCALE, 0, 0, ROOM_SCALE, 0, 0);
      const screen = terminal.screen();

      const fireFrame = Math.floor(t * FIRE_FPS) % room.fireFrames;
      drawStripFrame(ctx, art.fire, room.fireBox, animate ? fireFrame : 0);
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
      }
      if (animate) drawBlink(ctx, room.blink, t);
      if (lastKeyAt >= 0 && t - lastKeyAt < HANDS_LINGER_SECONDS) {
        drawStripFrame(ctx, art.hands, room.handsBox, keystrokes % room.handFrames);
      }
      const cursorOn = !animate || Math.floor(t * 2) % 2 === 0;
      const now = new Date();
      const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const mainContent = `${cursorOn}|${clock}|${screen.rows.join("\n")}`;
      const game = gameScreen();
      if (game) {
        if (game.frame !== paintedGameFrame) {
          paintedGameFrame = game.frame;
          paintedMain = "";
          main.finish(game.picture);
        }
      } else if (mainContent !== paintedMain) {
        paintedMain = mainContent;
        paintTerminal(main.flatCtx, main.flatWidth, main.flatHeight, screen.rows, cursorOn, clock);
        main.finish();
      }
      const firstLine = animate ? Math.floor(t / EDITOR_SCROLL_SECONDS) : 0;
      if (firstLine !== paintedLine) {
        paintedLine = firstLine;
        paintEditor(side.flatCtx, side.flatWidth, side.flatHeight, firstLine);
        side.finish();
      }
      ctx.drawImage(main.canvas, room.main.x, room.main.y, room.main.width, room.main.height);
      ctx.drawImage(side.canvas, room.side.x, room.side.y, room.side.width, room.side.height);
      if (animate) drawSteam(ctx, room.coffee, t);

      if (animate) drawSnore(ctx, room.snore, room.snoreDrift, t);
    },
  };
}
