type Frame = { now: number; camera: number; touchAge: number | null };

const LATE_MS = 20;
const SLOW_FRAME_MS = 25;
const SHOWN_SWIPES = 3;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const spread = (values: number[]) => Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
const centile = (values: number[], share: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;
const steps = (values: number[]) => values.slice(1).map((value, i) => value - values[i]);
const list = (values: number[]) => values.map((value) => value.toFixed(1)).join(" ");

// Opened with ?probe: after each swipe, shows how evenly the walk moved on this
// device. Camera positions are in device pixels.
export function startProbe(host: HTMLElement) {
  const panel = document.createElement("pre");
  panel.style.cssText = "position:absolute;top:0;left:0;right:0;margin:0;padding:6px 8px;z-index:99;pointer-events:none;font:10px/1.35 ui-monospace,monospace;color:#d8ffd8;background:rgba(0,0,0,.82);white-space:pre-wrap";
  panel.textContent = "probe: swipe the walk";
  host.append(panel);
  let frames: Frame[] = [];
  const swipes: string[] = [];

  function summary() {
    const frameMs = steps(frames.map(({ now }) => now));
    const drag = frames.filter(({ touchAge }) => touchAge !== null);
    const ages = drag.map(({ touchAge }) => touchAge!);
    const dragSteps = steps(drag.map(({ camera }) => camera)).map(Math.abs);
    const glideSteps = steps(frames.slice(Math.max(0, drag.length - 1)).map(({ camera }) => camera)).map(Math.abs);
    return [
      `${frames.length} frames · frame ms mean ${mean(frameMs).toFixed(1)} p95 ${centile(frameMs, 0.95).toFixed(1)} max ${Math.max(0, ...frameMs).toFixed(1)} · over ${SLOW_FRAME_MS}: ${frameMs.filter((ms) => ms > SLOW_FRAME_MS).length}`,
      `touch age ms p50 ${centile(ages, 0.5).toFixed(1)} p95 ${centile(ages, 0.95).toFixed(1)} max ${Math.max(0, ...ages).toFixed(1)} · late ${ages.filter((age) => age > LATE_MS).length}/${ages.length}`,
      `drag step px mean ${mean(dragSteps).toFixed(1)} sd ${spread(dragSteps).toFixed(1)} · still ${dragSteps.filter((step) => step === 0).length}`,
      `lift: ${list(dragSteps.slice(-4))} → ${list(glideSteps.slice(0, 5))}`,
    ].join("\n");
  }

  return {
    frame(now: number, camera: number, touchAge: number | null, gliding: boolean) {
      if (touchAge !== null || gliding) {
        frames.push({ now, camera, touchAge });
        return;
      }
      if (frames.length < 3) return;
      swipes.push(summary());
      frames = [];
      panel.textContent = swipes.slice(-SHOWN_SWIPES).join("\n\n");
    },
  };
}
