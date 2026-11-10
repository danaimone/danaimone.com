import type { RoomArt } from "./assets";
import { drawSteam, type GameScreen, type RoomLayout } from "./room-scene";
import simulationSource from "./simulation.ts?raw";
import { PROMPT, TERMINAL_COLUMNS, TERMINAL_ROWS, type Terminal } from "./terminal";

type Ctx = CanvasRenderingContext2D;

// Departure Mono is drawn on an 11 px grid: 7 px to a column, 8 px of capital
// above the baseline and 3 px below it. At a whole multiple of 11 device pixels
// every stroke lands on the screen's own pixels.
const FONT = "Departure Mono";
const FONT_GRID = 11;
const ADVANCE = 7 / FONT_GRID;
const LINE = 12 / FONT_GRID;
const BASELINE = 9 / FONT_GRID;
const SNAP_IF_WITHIN = 0.8;
const TERMINAL_LINES = TERMINAL_ROWS + 1.5;
const EDITOR_COLUMNS = 19;
const EDITOR_GUTTER = 4;
const MINIMAP_BELOW_PX = 9;
const EDITOR_SCROLL_SECONDS = 1.6;
const CURRENT_ROW = 3;

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

const KEYWORDS = /^(const|let|function|return|if|else|for|of|type|export|import|from|new|switch|case|default)\b/;
const EDITOR_LINES = simulationSource.split("\n");

export const screenFontReady = () => document.fonts.load(`${FONT_GRID}px "${FONT}"`);

// The largest type that fits, on the font's own grid when that costs little.
function typeSize(fit: number) {
  const onGrid = Math.floor(fit / FONT_GRID) * FONT_GRID;
  return onGrid >= fit * SNAP_IF_WITHIN ? onGrid : Math.floor(fit);
}

function setType(ctx: Ctx, size: number) {
  ctx.font = `${size}px "${FONT}", ui-monospace, monospace`;
  ctx.textBaseline = "alphabetic";
  return { advance: size * ADVANCE, line: Math.round(size * LINE), baseline: Math.round(size * BASELINE) };
}

function paintTerminal(ctx: Ctx, width: number, height: number, rows: string[], cursorOn: boolean, clock: string) {
  const size = typeSize(Math.min(width / ((TERMINAL_COLUMNS + 1.5) * ADVANCE), height / (TERMINAL_LINES * LINE)));
  const { advance, line, baseline } = setType(ctx, size);
  const margin = Math.round(advance * 0.75);
  const top = Math.round(line * 0.3);
  ctx.fillStyle = MOCHA.base;
  ctx.fillRect(0, 0, width, height);
  const history = rows.slice(0, -1);
  const input = rows.at(-1) ?? PROMPT;
  history.forEach((row, index) => {
    ctx.fillStyle = row.startsWith(PROMPT) ? MOCHA.green : MOCHA.text;
    ctx.fillText(row, margin, top + index * line + baseline);
  });

  const barY = top + history.length * line;
  const pad = Math.round(advance / 2);
  const segment = (text: string, background: string, left: number, right: number) => {
    ctx.fillStyle = background;
    ctx.fillRect(left, barY, right - left, line);
    ctx.fillStyle = MOCHA.base;
    ctx.fillText(text, left + pad, barY + baseline);
  };
  const user = Math.round("dan".length * advance) + pad * 2;
  const path = user + Math.round("~/cabin".length * advance) + pad * 2;
  const clockLeft = width - Math.round(clock.length * advance) - pad * 2;
  segment("dan", MOCHA.overlay2, 0, user);
  segment("~/cabin", MOCHA.peach, user, path);
  ctx.fillStyle = MOCHA.surface;
  ctx.fillRect(path, barY, clockLeft - path, line);
  segment(clock, MOCHA.pink, clockLeft, width);

  const inputY = barY + line + Math.round(line * 0.2);
  ctx.fillStyle = MOCHA.green;
  ctx.fillText(PROMPT, margin, inputY + baseline);
  ctx.fillStyle = MOCHA.text;
  ctx.fillText(input.slice(PROMPT.length), margin + PROMPT.length * advance, inputY + baseline);
  if (cursorOn) ctx.fillRect(Math.round(margin + input.length * advance), inputY, Math.round(advance), line);
}

function colourOf(text: string, word: string | undefined, next: string | undefined) {
  if (text.startsWith('"')) return MOCHA.green;
  if (/^\d/.test(text)) return MOCHA.peach;
  if (KEYWORDS.test(text)) return MOCHA.mauve;
  if (word && next === "(") return MOCHA.blue;
  if (word && /^[A-Z]/.test(word)) return MOCHA.yellow;
  return MOCHA.text;
}

function tokens(line: string, columns: number) {
  const found: { text: string; column: number; colour: string }[] = [];
  let column = 0;
  let rest = line.slice(0, columns);
  while (rest) {
    const word = rest.match(/^[A-Za-z_$][\w$]*/)?.[0];
    const text = rest.match(/^"[^"]*"?/)?.[0] ?? rest.match(/^\d+\.?\d*/)?.[0] ?? word ?? rest.match(/^\s+/)?.[0] ?? rest[0];
    if (text.trim()) found.push({ text, column, colour: colourOf(text, word, rest[word?.length ?? 0]) });
    column += text.length;
    rest = rest.slice(text.length);
  }
  return found;
}

// Type too small to read is drawn as a minimap instead: one bar for each word,
// in the colour the word would have.
function paintEditor(ctx: Ctx, width: number, height: number, firstLine: number) {
  const size = typeSize(width / (EDITOR_COLUMNS * ADVANCE));
  const { advance, line, baseline } = setType(ctx, size);
  const minimap = size < MINIMAP_BELOW_PX;
  const rows = Math.floor(height / line) - 1;
  const codeColumns = Math.floor(width / advance) - EDITOR_GUTTER;
  const write = (text: string, column: number, y: number) => {
    if (!minimap) return ctx.fillText(text, Math.round(column * advance), y + baseline);
    ctx.fillRect(Math.round(column * advance), y + Math.round(line * 0.3), Math.max(1, Math.round(text.length * advance) - 1), Math.max(1, Math.round(line * 0.45)));
  };
  ctx.fillStyle = MOCHA.base;
  ctx.fillRect(0, 0, width, height);
  for (let row = 0; row < rows; row++) {
    const number = (firstLine + row) % EDITOR_LINES.length;
    ctx.fillStyle = row === CURRENT_ROW ? MOCHA.yellow : MOCHA.overlay;
    const label = String(number + 1);
    write(label, EDITOR_GUTTER - 1 - label.length, row * line);
    for (const token of tokens(EDITOR_LINES[number].trimEnd(), codeColumns)) {
      ctx.fillStyle = token.colour;
      write(token.text, EDITOR_GUTTER + token.column, row * line);
    }
  }
  const barY = height - line;
  const mode = Math.round(advance * 3);
  ctx.fillStyle = MOCHA.surface;
  ctx.fillRect(0, barY, width, line);
  ctx.fillStyle = MOCHA.green;
  ctx.fillRect(0, barY, mode, line);
  ctx.fillStyle = MOCHA.mantle;
  write("N", 1, barY);
  ctx.fillStyle = MOCHA.text;
  write("simulation.ts", 4, barY);
}

function keepInsideGlass(ctx: Ctx, mask: HTMLImageElement) {
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = "source-over";
}

export type ScreenCanvases = { main: HTMLCanvasElement; side: HTMLCanvasElement };

// The two monitors are drawn on their own canvases at the display's resolution,
// over the room. The room's canvas is too coarse for type: a terminal row there
// is three art pixels tall.
export function createRoomScreens(canvases: ScreenCanvases, art: RoomArt, room: RoomLayout, terminal: Terminal, gameScreen: () => GameScreen | null | undefined) {
  const main = canvases.main.getContext("2d")!;
  const side = canvases.side.getContext("2d")!;
  const editor = document.createElement("canvas");
  const editorCtx = editor.getContext("2d")!;
  let paintedMain = "";
  let paintedGameFrame = 0;
  let paintedLine = -1;
  let paintedSide = "";

  return {
    // Resizing a canvas wipes it, so whoever places the screens says so here.
    wiped() {
      paintedMain = "";
      paintedGameFrame = 0;
      paintedLine = -1;
      paintedSide = "";
    },
    draw(t: number, animate: boolean) {
      const screen = terminal.screen();
      const cursorOn = !animate || Math.floor(t * 2) % 2 === 0;
      const now = new Date();
      const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const content = `${cursorOn}|${clock}|${screen.rows.join("\n")}`;
      const game = gameScreen();
      if (game) {
        if (game.frame !== paintedGameFrame) {
          paintedGameFrame = game.frame;
          paintedMain = "";
          main.imageSmoothingEnabled = false;
          main.drawImage(game.picture, 0, 0, main.canvas.width, main.canvas.height);
          keepInsideGlass(main, art.screen);
        }
      } else if (content !== paintedMain) {
        paintedMain = content;
        paintTerminal(main, main.canvas.width, main.canvas.height, screen.rows, cursorOn, clock);
        keepInsideGlass(main, art.screen);
      }

      const firstLine = animate ? Math.floor(t / EDITOR_SCROLL_SECONDS) : 0;
      if (firstLine !== paintedLine) {
        paintedLine = firstLine;
        editor.width = side.canvas.width;
        editor.height = side.canvas.height;
        paintEditor(editorCtx, editor.width, editor.height, firstLine);
      }
      // The mug stands in front of the second monitor, so its steam crosses the glass.
      const steam = animate ? Math.floor(t * 30) : -1;
      const sideContent = `${firstLine}|${steam}`;
      if (sideContent === paintedSide) return;
      paintedSide = sideContent;
      side.setTransform(1, 0, 0, 1, 0, 0);
      side.drawImage(editor, 0, 0);
      if (animate) {
        const scaleX = side.canvas.width / room.side.width;
        const scaleY = side.canvas.height / room.side.height;
        side.setTransform(scaleX, 0, 0, scaleY, -room.side.x * scaleX, -room.side.y * scaleY);
        drawSteam(side, room.coffee, t);
        side.setTransform(1, 0, 0, 1, 0, 0);
      }
      keepInsideGlass(side, art.side);
    },
  };
}

export type RoomScreens = ReturnType<typeof createRoomScreens>;
