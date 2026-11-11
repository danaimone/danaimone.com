import { loadRoom } from "./assets";
import type { PageActivity } from "./page-activity";
import layouts from "./room-layouts.json";
import { ROOM_SCALE, createRoomScene, type GameScreen } from "./room-scene";
import { createRoomScreens, screenFontReady, type RoomScreens, type ScreenCanvases } from "./room-screens";
import type { Terminal } from "./terminal";
import { clamp } from "./track";
import { IRIS_FROM_FINALE, type Bounds } from "./wipe";

const ROOMS = {
  wide: {
    ...layouts.wide,
    focusX: 0.5,
    focusY: 0.6,
    anchorY: 0.6,
    subjectSpan: 0.9,
  },
  tall: {
    ...layouts.tall,
    keep: { dansBack: 30, fireboxEnd: 335 },
    focusY: 0.58,
    anchorY: 0.55,
    subjectSpan: 0.85,
  },
};
type RoomName = keyof typeof ROOMS;
type Room = (typeof ROOMS)[RoomName];

const WIDE_ROOM_MIN_ASPECT = 1.1;
const ROOM_SCALE_SNAP = 0.05;
const ROOM_REVEAL_LEAD = 0.04;
const ROOM_WARM_FINALE = 0.24;
const ROOM_CLEAR_SETTLE_SECONDS = 0.1;
const SCROLLING_ROOM_HZ = 9;
const SCREEN_STEADY = { startEvery: 1.6, blinkEvery: 0.5, span: 0.44 };
const CANDLE_REACH = 26;
const STEAM_BOX = { left: 10, top: 20, width: 20, height: 22 };
const SNORE_BOX = { left: 8, top: 40, width: 16, height: 48 };

function roomLeft(room: Room, pixel: number, viewW: number) {
  if (!("keep" in room)) return viewW / 2 - room.focusX * room.width * pixel;
  const { dansBack, fireboxEnd } = room.keep;
  const keptSpanFits = (fireboxEnd - dansBack) * pixel <= viewW;
  if (keptSpanFits) return viewW / 2 - ((dansBack + fireboxEnd) / 2) * pixel;
  return viewW - fireboxEnd * pixel;
}

function movingBoxes(room: Room) {
  const { coffee, snore, snoreDrift } = room;
  return [
    room.fireBox,
    room.mishkaBox,
    room.handsBox,
    room.blink,
    { x: coffee.x - STEAM_BOX.left, y: coffee.y - STEAM_BOX.top, width: STEAM_BOX.width, height: STEAM_BOX.height },
    { x: snore.x + Math.min(snoreDrift, 0) - SNORE_BOX.left, y: snore.y - SNORE_BOX.top, width: Math.abs(snoreDrift) + SNORE_BOX.width, height: SNORE_BOX.height },
    ...room.candles.map(({ x, y }) => ({ x: x - CANDLE_REACH, y: y - CANDLE_REACH, width: CANDLE_REACH * 2, height: CANDLE_REACH * 2 })),
  ];
}

type RoomViewParts = {
  canvas: HTMLCanvasElement;
  screens: ScreenCanvases;
  view: HTMLElement;
  terminal: Terminal;
  gameScreen: () => GameScreen | null | undefined;
  reduced: boolean;
  page: PageActivity;
  holeBounds: (iris: number) => Bounds;
  unavailable: () => void;
};

export function createRoomView({ canvas, screens, view, terminal, gameScreen, reduced, page, holeBounds, unavailable }: RoomViewParts) {
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const scenes: Partial<Record<RoomName, { room: ReturnType<typeof createRoomScene>; screens: RoomScreens }>> = {};
  const asked = new Set<RoomName>();
  let placed = "";
  let clearedAt = -Infinity;
  let warm = false;

  const roomName = (): RoomName => (view.clientWidth / view.clientHeight >= WIDE_ROOM_MIN_ASPECT ? "wide" : "tall");

  function fetchRoom(name: RoomName) {
    if (asked.has(name)) return;
    asked.add(name);
    loadRoom(name).then((art) => {
      scenes[name] = { room: createRoomScene(art, ROOMS[name], terminal), screens: createRoomScreens(screens, art, ROOMS[name], terminal, gameScreen) };
      placed = "";
    }, unavailable);
  }

  // Re-projecting a screen costs more than the rest of a paint. Mid-scroll the
  // room's clock loops inside one cursor blink and one editor line, so the
  // screens hold still while the fire and Mishka keep moving.
  function steadyScreenTime(t: number) {
    const { startEvery, blinkEvery, span } = SCREEN_STEADY;
    const start = Math.ceil(Math.floor(page.scrollBeganAt() / startEvery) * startEvery / blinkEvery) * blinkEvery;
    return start + (Math.floor(t * SCROLLING_ROOM_HZ) / SCROLLING_ROOM_HZ) % span;
  }

  function paint(iris: number, t: number) {
    if (iris === 0) return;
    const viewW = view.clientWidth;
    const viewH = view.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const name = roomName();
    const scene = scenes[name];
    if (!scene) return fetchRoom(name);
    const room = ROOMS[name];
    const cover = Math.max(viewW / room.width, viewH / room.height);
    const crisp = Math.ceil(cover * dpr - ROOM_SCALE_SNAP) / dpr;
    const pixel = room.width * crisp * room.subjectSpan <= viewW ? Math.max(crisp, cover) : cover;
    const w = room.width * pixel;
    const h = room.height * pixel;
    const left = Math.round(clamp(roomLeft(room, pixel, viewW), viewW - w, 0));
    const top = Math.round(clamp(viewH * room.anchorY - room.focusY * h, viewH - h, 0));
    const place = `${name} ${w} ${h} ${left} ${top}`;
    if (place !== placed) {
      placed = place;
      canvas.width = room.width * ROOM_SCALE;
      canvas.height = room.height * ROOM_SCALE;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      for (const [screen, box] of [[screens.main, room.main], [screens.side, room.side]] as const) {
        const edge = (art: number, origin: number) => Math.round((origin + art * pixel) * dpr) / dpr;
        const [x0, x1, y0, y1] = [edge(box.x, left), edge(box.x + box.width, left), edge(box.y, top), edge(box.y + box.height, top)];
        screen.width = Math.round((x1 - x0) * dpr);
        screen.height = Math.round((y1 - y0) * dpr);
        screen.style.width = `${x1 - x0}px`;
        screen.style.height = `${y1 - y0}px`;
        screen.style.left = `${x0}px`;
        screen.style.top = `${y0}px`;
      }
      scene.room.wiped();
      scene.screens.wiped();
      clearedAt = t;
    }

    // The plate is already on the canvas, so a scroll only repaints what moves:
    // a full repaint costs a long task, and nobody reads the room mid-swipe.
    const movingPartsOnly = page.scrolling() && t - clearedAt > ROOM_CLEAR_SETTLE_SECONDS;
    if (movingPartsOnly && page.yieldToRestyle()) return;
    ctx.save();
    if (movingPartsOnly && iris < 1) {
      const hole = holeBounds(iris);
      const toRoom = (cssX: number, cssY: number) => ({ x: ((cssX - left) / pixel) * ROOM_SCALE, y: ((cssY - top) / pixel) * ROOM_SCALE });
      const corner = toRoom(hole.left, hole.top);
      const across = toRoom(hole.right, hole.bottom);
      ctx.beginPath();
      ctx.rect(corner.x, corner.y, across.x - corner.x, across.y - corner.y);
      ctx.clip();
    }
    ctx.beginPath();
    if (movingPartsOnly) {
      for (const box of movingBoxes(room)) ctx.rect(box.x * ROOM_SCALE, box.y * ROOM_SCALE, box.width * ROOM_SCALE, box.height * ROOM_SCALE);
    } else if (reduced) {
      ctx.rect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.rect((-left / pixel) * ROOM_SCALE, (-top / pixel) * ROOM_SCALE, (viewW / pixel) * ROOM_SCALE, (viewH / pixel) * ROOM_SCALE);
    }
    ctx.clip();
    const sceneTime = movingPartsOnly ? steadyScreenTime(t) : t;
    scene.room.draw(ctx, sceneTime, !reduced, iris < 1);
    ctx.restore();
    scene.screens.draw(sceneTime, !reduced);
  }

  function hide(hidden: boolean) {
    for (const element of [canvas, screens.main, screens.side]) element.hidden = hidden;
  }

  fetchRoom(roomName());
  screenFontReady().then(() => (placed = ""));
  hide(true);

  return {
    // The first paint re-projects both screens, so it gets a quiet frame of its
    // own before the reveal and the wipe, which are heavy enough by themselves.
    follow(finale: number, t: number) {
      const warmNow = finale >= ROOM_WARM_FINALE;
      if (warmNow !== warm) {
        warm = warmNow;
        if (warm) paint(1, t);
      }
      const ahead = finale <= IRIS_FROM_FINALE - ROOM_REVEAL_LEAD;
      if (canvas.hidden !== ahead) hide(ahead);
    },
    paint,
    stokeFire() {
      scenes[roomName()]?.room.stoke();
    },
  };
}
