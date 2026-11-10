export type Hearth = { width: number; height: number; floor: number[]; middle: number; reach: number };

const HEAT = 64;
const STEADY = 0.45;
const FEED_ROWS = 5;
const COOLING = [0, 1, 1, 1, 2];
const DRIFT = [-1, 0, 0, 1];
const WARM_UP_STEPS = 80;
const STOKED_STEPS = 36;
const STOKED_KEEPS_HEAT = 0.5;
const INKS = [
  { least: 44, rgb: [255, 240, 180] },
  { least: 32, rgb: [255, 204, 92] },
  { least: 19, rgb: [255, 150, 40] },
  { least: 8, rgb: [232, 92, 24] },
];

// A fire that never repeats. Heat is fed in along the logs' top edge (`floor`, one
// row per column), hottest in the middle. Each step a cell takes the heat of a cell
// just below it, shifted a column either way and cooled by a random amount. The
// feed swells and fades along the logs, so the heat rises as separate tongues.
export function createFire({ width, height, floor, middle, reach }: Hearth, random: () => number = Math.random) {
  const heat = new Uint8Array(width * height);
  const pick = (from: number[]) => from[Math.floor(random() * from.length)];
  let steps = 0;
  let stoked = 0;

  function step() {
    const flare = stoked / STOKED_STEPS;
    for (let x = 0; x < width; x++) {
      const offCentre = Math.min(1, Math.abs(x - middle) / reach);
      const lick = 0.5 + 0.5 * Math.sin(x * 0.55 + steps * 0.8) * Math.sin(x * 0.23 - steps * 0.45 + 1.3);
      const fuel = HEAT * (1 - offCentre ** 2) * (STEADY + (1 - STEADY) * Math.max(lick, flare));
      for (let y = floor[x]; y < Math.min(height, floor[x] + FEED_ROWS); y++) heat[y * width + x] = Math.round(fuel * (0.7 + 0.3 * random()));
    }
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width; x++) {
        if (y >= floor[x]) continue;
        const source = Math.min(width - 1, Math.max(0, x + pick(DRIFT)));
        const cooling = stoked > 0 && random() < flare * STOKED_KEEPS_HEAT ? 0 : pick(COOLING);
        heat[y * width + x] = Math.max(0, heat[(y + 1) * width + source] - cooling);
      }
    }
    steps++;
    stoked = Math.max(0, stoked - 1);
  }

  for (let i = 0; i < WARM_UP_STEPS; i++) step();

  return {
    step,
    // A poke at the logs: for a few seconds every tongue burns at full fuel and holds its heat higher.
    stoke() {
      stoked = STOKED_STEPS;
    },
    // Each pixel is inked from the average heat around it, so a tongue has a clean
    // edge. Nothing is painted at or below the logs.
    paint(rgba: Uint8ClampedArray) {
      rgba.fill(0);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (y >= floor[x]) continue;
          let sum = heat[y * width + x];
          let cells = 1;
          for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
              if (ny >= floor[nx]) continue;
              sum += heat[ny * width + nx];
              cells++;
            }
          }
          const ink = INKS.find(({ least }) => sum / cells >= least);
          if (ink) rgba.set([...ink.rgb, 255], (y * width + x) * 4);
        }
      }
    },
  };
}
