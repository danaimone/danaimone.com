import files from "./doom-files.json";

const WIDTH = 320;
const HEIGHT = 200;
const TIC_MS = 1000 / 35;
const MOST_TICS_PER_FRAME = 3;
const HINT = "Arrows move · X fire · Space use · F fullscreen · Esc quits";
const HINT_FULLSCREEN = "Arrows move · X fire · Space use · Esc leaves fullscreen · Esc again quits";
const PAUSED = "Paused. Click here to carry on.";
const FULLSCREEN_GRACE_MS = 500;
const ESCAPE_GRACE_MS = 400;

const DOOM_KEY = {
  up: 0xad,
  down: 0xaf,
  left: 0xac,
  right: 0xae,
  strafeLeft: 0xa0,
  strafeRight: 0xa1,
  use: 0xa2,
  fire: 0xa3,
  run: 0x80 + 0x36,
  strafe: 0x80 + 0x38,
  enter: 13,
  automap: 9,
};

const KEYS: Record<string, number> = {
  arrowup: DOOM_KEY.up,
  w: DOOM_KEY.up,
  arrowdown: DOOM_KEY.down,
  s: DOOM_KEY.down,
  arrowleft: DOOM_KEY.left,
  arrowright: DOOM_KEY.right,
  a: DOOM_KEY.strafeLeft,
  d: DOOM_KEY.strafeRight,
  " ": DOOM_KEY.use,
  e: DOOM_KEY.use,
  x: DOOM_KEY.fire,
  control: DOOM_KEY.fire,
  shift: DOOM_KEY.run,
  alt: DOOM_KEY.strafe,
  enter: DOOM_KEY.enter,
  tab: DOOM_KEY.automap,
};

const SCROLL_KEYS = new Set(["pageup", "pagedown", "home", "end"]);

const doomCode = (key: string) => KEYS[key] ?? (key.length === 1 && key >= " " && key <= "~" ? key.charCodeAt(0) : undefined);

const download = async ({ url, integrity }: { url: string; integrity: string }) => {
  const response = await fetch(url, { integrity });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
};

export type DoomEnd = "quit" | "failed";

export function startDoom(host: HTMLElement, onEnd: (end: DoomEnd) => void) {
  const worker = new Worker("/doom/engine.js");
  const stage = document.createElement("div");
  const picture = document.createElement("canvas");
  const pictureCtx = picture.getContext("2d", { alpha: false })!;
  const bar = document.createElement("div");
  const hint = document.createElement("span");
  const held = new Map<string, number>();
  let ready = false;
  let ended = false;
  let paused = false;
  let waitingForFrame = false;
  let lastTic = 0;
  let spare: Uint8ClampedArray | null = null;
  let frame = 0;
  let fullscreenSettling = 0;
  let escapeIgnoredUntil = 0;

  stage.tabIndex = -1;
  Object.assign(stage.style, { position: "absolute", inset: "0", pointerEvents: "none", outline: "none" });
  picture.width = WIDTH;
  picture.height = HEIGHT;
  picture.hidden = true;
  Object.assign(picture.style, { width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", background: "#000" });

  const inFullscreen = () => document.fullscreenElement === stage;
  const showHint = () => {
    hint.textContent = paused ? PAUSED : inFullscreen() ? HINT_FULLSCREEN : HINT;
  };
  showHint();
  const quitButton = document.createElement("button");
  quitButton.type = "button";
  quitButton.className = "copy";
  quitButton.textContent = "Quit (Esc)";
  quitButton.onclick = () => end("quit");
  const fullButton = document.createElement("button");
  fullButton.type = "button";
  fullButton.className = "copy";
  fullButton.textContent = "Fullscreen (F)";
  fullButton.onclick = () => {
    if (inFullscreen()) leaveFullscreen();
    else goFullscreen();
    stage.focus();
  };
  const licence = document.createElement("a");
  licence.href = "/doom/";
  licence.target = "_blank";
  licence.rel = "noopener";
  licence.textContent = "Licence and source";
  bar.append(hint, ...(document.fullscreenEnabled ? [fullButton] : []), quitButton, licence);
  Object.assign(bar.style, {
    position: "absolute",
    zIndex: "40",
    left: "50%",
    bottom: "1rem",
    transform: "translateX(-50%)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.5rem 1rem",
    width: "max-content",
    maxWidth: "calc(100% - 2rem)",
    padding: "0.5rem 0.75rem",
    background: "#11111b",
    color: "#cdd6f4",
    font: "500 0.8125rem/1.3 var(--sans)",
    pointerEvents: "auto",
  });
  stage.append(picture, bar);
  host.append(stage);

  const stopScroll = (event: Event) => event.preventDefault();
  const scrollBlock = { passive: false };

  function send(down: boolean, code: number) {
    worker.postMessage({ type: "key", down, code });
  }

  function releaseKeys() {
    for (const code of held.values()) send(false, code);
    held.clear();
  }

  function setPaused(next: boolean) {
    paused = next;
    showHint();
    if (next) releaseKeys();
  }

  const settlingFullscreen = () => inFullscreen() || performance.now() < fullscreenSettling;
  const onBlur = () => {
    if (!settlingFullscreen()) setPaused(true);
  };
  const onFocus = () => setPaused(false);
  const onVisibility = () => setPaused(document.hidden);
  const onFullscreen = () => {
    const full = inFullscreen();
    fullscreenSettling = performance.now() + FULLSCREEN_GRACE_MS;
    if (!full) escapeIgnoredUntil = performance.now() + ESCAPE_GRACE_MS;
    picture.hidden = !full;
    stage.style.background = full ? "#000" : "";
    fullButton.textContent = full ? "Exit fullscreen (Esc)" : "Fullscreen (F)";
    showHint();
    stage.focus();
  };

  function goFullscreen() {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    fullscreenSettling = performance.now() + FULLSCREEN_GRACE_MS;
    stage.requestFullscreen().catch(() => {});
  }

  function leaveFullscreen() {
    if (inFullscreen()) document.exitFullscreen().catch(() => {});
  }

  function end(reason: DoomEnd) {
    if (ended) return;
    ended = true;
    worker.terminate();
    window.removeEventListener("wheel", stopScroll);
    window.removeEventListener("touchmove", stopScroll);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("fullscreenchange", onFullscreen);
    leaveFullscreen();
    stage.remove();
    onEnd(reason);
  }

  worker.onerror = () => end("failed");
  worker.onmessage = ({ data }) => {
    if (data.type === "frame") {
      pictureCtx.putImageData(new ImageData(data.pixels, WIDTH, HEIGHT), 0, 0);
      spare = data.pixels;
      frame += 1;
      waitingForFrame = false;
      return;
    }
    if (data.type === "ready") {
      ready = true;
      lastTic = performance.now();
      return;
    }
    end(data.type === "failed" || !ready ? "failed" : "quit");
  };

  window.addEventListener("wheel", stopScroll, scrollBlock);
  window.addEventListener("touchmove", stopScroll, scrollBlock);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("fullscreenchange", onFullscreen);

  Promise.all([download(files.wasm), download(files.wad)]).then(
    ([wasm, wad]) => {
      if (!ended) worker.postMessage({ wasm, wad }, [wasm, wad]);
    },
    () => end("failed"),
  );

  return {
    pump(now: number) {
      if (!ready || paused) {
        lastTic = now;
        return;
      }
      const due = Math.floor((now - lastTic) / TIC_MS);
      if (due < 1 || waitingForFrame) return;
      lastTic = due > MOST_TICS_PER_FRAME ? now : lastTic + due * TIC_MS;
      waitingForFrame = true;
      const reuse = spare;
      spare = null;
      worker.postMessage({ type: "tick", count: Math.min(due, MOST_TICS_PER_FRAME), spare: reuse }, reuse ? [reuse.buffer] : []);
    },
    screen: () => (frame > 0 ? { picture, frame } : null),
    fullscreen: inFullscreen,
    keyDown(event: KeyboardEvent) {
      if (event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        event.preventDefault();
        if (inFullscreen()) leaveFullscreen();
        else if (performance.now() >= escapeIgnoredUntil) end("quit");
        return;
      }
      if (event.ctrlKey && key === "c") {
        event.preventDefault();
        end("quit");
        return;
      }
      const code = doomCode(key);
      if (code === undefined) {
        if (SCROLL_KEYS.has(key)) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (key === "f") {
        goFullscreen();
        return;
      }
      if (event.repeat || held.has(key) || paused) return;
      held.set(key, code);
      send(true, code);
    },
    keyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const code = held.get(key);
      if (code === undefined) return;
      held.delete(key);
      send(false, code);
    },
    end,
  };
}

export type Doom = ReturnType<typeof startDoom>;
