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

document.addEventListener("click", (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  const hash = link?.getAttribute("href");
  const target = hash ? document.querySelector<HTMLElement>(hash) : null;
  if (!hash || !target) return;
  event.preventDefault();

  const jump = () => {
    history.pushState(null, "", hash);
    target.scrollIntoView();
    target.focus({ preventScroll: true });
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) jump();
  else pixelWipe(event.clientX, event.clientY, jump);
});
