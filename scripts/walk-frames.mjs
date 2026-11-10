#!/usr/bin/env node
// Captures the walk frame by frame, so a change that should not move a pixel can prove it.
//
//   bun run build && python3 -m http.server 4321 -d dist   (any static server)
//   node scripts/walk-frames.mjs before               (capture)
//   ...change the code, rebuild...
//   node scripts/walk-frames.mjs after before         (capture, then compare with `before`)
//
// The page gets a fake frame clock, a fixed date and seeded randomness, so two captures of one build are identical.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [out, against] = process.argv.slice(2);
const url = process.env.WALK_URL ?? "http://127.0.0.1:4321/";
if (!out) throw new Error("usage: walk-frames.mjs <out dir> [dir to compare with]");
mkdirSync(out, { recursive: true });

const SCREENS = [
  ["warm-up", { width: 1440, height: 900 }, 1, false],
  ["desk", { width: 1440, height: 900 }, 1, false],
  ["phone", { width: 390, height: 844 }, 2, true],
  ["tablet", { width: 820, height: 1100 }, 1, true],
  ["short", { width: 1280, height: 620 }, 1, false],
];

function controlTime() {
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let now = 1000;
  let queue = [];
  let ids = 0;
  performance.now = () => now;
  const RealDate = Date;
  const epoch = RealDate.UTC(2026, 10, 10, 20, 0, 0);
  window.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(epoch + now);
    }
    static now() {
      return epoch + now;
    }
  };
  window.requestAnimationFrame = (callback) => {
    queue.push([++ids, callback]);
    return ids;
  };
  window.cancelAnimationFrame = (id) => {
    queue = queue.filter(([queued]) => queued !== id);
  };
  window.advanceFrames = (ms) => {
    for (let left = Math.round(ms / (1000 / 60)); left > 0; left--) {
      now += 1000 / 60;
      const due = queue;
      queue = [];
      for (const [, callback] of due) callback(now);
    }
  };
}

const browser = await chromium.launch();
const hashes = {};
const errors = [];
for (const [name, viewport, deviceScaleFactor, touch] of SCREENS) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  await page.addInitScript(controlTime);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".walk-view")?.classList.contains("is-laid-out"), null, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((done) => setTimeout(done, 1500));

  const advance = (ms) => page.evaluate((ms) => window.advanceFrames(ms), ms);
  const shot = async (label) => {
    await page.evaluate(() => getComputedStyle(document.body).color);
    const png = await page.screenshot({ animations: "disabled" });
    if (name === "warm-up") return;
    writeFileSync(`${out}/${name}-${label}.png`, png);
    hashes[`${name}-${label}`] = createHash("sha256").update(png).digest("hex").slice(0, 16);
  };
  const track = await page.evaluate(() => {
    const walk = document.querySelector(".walk");
    return [walk.offsetTop, walk.offsetHeight - innerHeight];
  });
  const scrollTo = async (fraction, ms) => {
    await page.evaluate(([top, travel, fraction]) => window.scrollTo(0, top + travel * fraction), [...track, fraction]);
    await advance(ms);
  };

  await advance(1500);
  await shot("start");
  for (const fraction of [0.08, 0.2, 0.33, 0.47, 0.6, 0.72, 0.8, 0.86]) {
    await scrollTo(fraction, 150);
    await shot(`move-${fraction}`);
    await advance(3000);
    await shot(`rest-${fraction}`);
  }
  for (const fraction of [0.9, 0.93, 0.95, 0.97, 0.985, 1]) {
    await scrollTo(fraction, 400);
    await shot(`finale-move-${fraction}`);
    await advance(3000);
    await shot(`finale-rest-${fraction}`);
  }
  await advance(5000);
  await shot("cabin-later");
  for (const fraction of [0.975, 0.955, 0.94, 0.91]) {
    await scrollTo(fraction, 300);
    await shot(`back-move-${fraction}`);
    await advance(1500);
    await shot(`back-rest-${fraction}`);
  }
  await scrollTo(0.5, 3000);
  await page.evaluate(() => document.querySelector(".walk-canvas").click());
  await advance(180);
  await shot("jump");
  await advance(2000);
  await page.evaluate(() => document.querySelectorAll(".walk-timeline button")[1].click());
  await advance(200);
  await shot("beam");
  await advance(3000);
  await shot("after-teleport");
  if (!touch) {
    await page.keyboard.down("ArrowRight");
    await advance(1200);
    await shot("arrow");
    await page.keyboard.up("ArrowRight");
    await advance(1500);
    await shot("arrow-rest");
  }
  await context.close();
}
await browser.close();
writeFileSync(`${out}/hashes.json`, JSON.stringify(hashes, null, 1));
console.log(`${Object.keys(hashes).length} frames in ${out}`);
if (errors.length) console.log("page errors:", errors);
if (against) {
  const before = JSON.parse(readFileSync(`${against}/hashes.json`, "utf8"));
  const changed = Object.keys(hashes).filter((frame) => hashes[frame] !== before[frame]);
  console.log(changed.length ? `${changed.length} frames differ from ${against}: ${changed.join(", ")}` : `identical to ${against}`);
  process.exitCode = changed.length ? 1 : 0;
}
