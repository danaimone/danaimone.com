const CELL_PX = 44;
const PHASE_MS = 300;
const NOISE = 0.22;
const EDGE = 0.07;
const COVER = "#11111b";
const EDGE_COLOR = "#fab387";

function cellOrder(cols: number, rows: number, fromX: number, fromY: number) {
  const reach = Math.hypot(Math.max(fromX, cols - fromX), Math.max(fromY, rows - fromY));
  return Array.from({ length: cols * rows }, (_, i) => {
    const x = i % cols;
    const y = Math.floor(i / cols);
    return { x, y, at: (Math.hypot(x - fromX, y - fromY) / reach) * (1 - NOISE) + Math.random() * NOISE };
  });
}

function pixelWipe(clientX: number, clientY: number, atCover: () => void) {
  const canvas = document.createElement("canvas");
  canvas.className = "pixel-wipe";
  canvas.width = Math.ceil(window.innerWidth / CELL_PX);
  canvas.height = Math.ceil(window.innerHeight / CELL_PX);
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const cells = cellOrder(canvas.width, canvas.height, clientX / CELL_PX, clientY / CELL_PX);
  const start = performance.now();
  let covered = false;

  function frame(now: number) {
    const elapsed = now - start;
    const covering = elapsed < PHASE_MS;
    const progress = (covering ? elapsed : elapsed - PHASE_MS) / PHASE_MS;
    if (!covering && !covered) {
      covered = true;
      atCover();
    }
    if (!covering && progress >= 1) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const cell of cells) {
      const age = progress - cell.at;
      const shown = covering ? age >= 0 : age < 0;
      if (!shown) continue;
      ctx.fillStyle = Math.abs(age) < EDGE ? EDGE_COLOR : COVER;
      ctx.fillRect(cell.x, cell.y, 1, 1);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const TAP_SLOP_PX = 10;

function sectionLink(target: EventTarget | null) {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
  const hash = link?.getAttribute("href");
  const section = hash ? document.querySelector<HTMLElement>(hash) : null;
  return hash && section ? { hash, section } : null;
}

function goTo({ hash, section }: { hash: string; section: HTMLElement }, clientX: number, clientY: number) {
  const jump = () => {
    history.pushState(null, "", hash);
    section.scrollIntoView();
    section.focus({ preventScroll: true });
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) jump();
  else pixelWipe(clientX, clientY, jump);
}

document.addEventListener("click", (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  const link = sectionLink(event.target);
  if (!link) return;
  event.preventDefault();
  goTo(link, event.clientX, event.clientY);
});

// iOS Safari can treat the first tap on a link as a hover and send no click
// (https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html).
// A tap on a section link is followed from the touch itself, and its click is cancelled.
let touchedAt: { x: number; y: number } | null = null;
document.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    touchedAt = touch && sectionLink(event.target) ? { x: touch.clientX, y: touch.clientY } : null;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (event) => {
    const start = touchedAt;
    touchedAt = null;
    const touch = event.changedTouches[0];
    const link = sectionLink(event.target);
    if (!start || !link || !event.cancelable || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) return;
    event.preventDefault();
    goTo(link, touch.clientX, touch.clientY);
  },
  { passive: false },
);
