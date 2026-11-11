#!/usr/bin/env node
// Captures the walk's opening scene as the stills the hero shows when scripts are off.
//
//   bun run build && python3 -m http.server 4321 -d dist   (any static server)
//   node scripts/hero-still.mjs                       (writes public/images/hero-wide.png and hero-tall.png)
//
// One image pixel per art pixel, stored as an indexed PNG: colours past the 256 most used take the nearest
// kept colour. The clock and randomness are fixed as in walk-frames.mjs, so two runs write identical files.
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.WALK_URL ?? "http://127.0.0.1:4321/";
const out = process.argv[2] ?? "public/images";

const STILLS = [
  ["hero-wide", { width: 2880, height: 1035 }, 1],
  ["hero-tall", { width: 392, height: 1040 }, 3],
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

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function indexedPng({ width, height, art }) {
  const counts = new Map();
  for (const colour of art) counts.set(colour, (counts.get(colour) ?? 0) + 1);
  const byUse = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || (a < b ? -1 : 1));
  const palette = byUse.slice(0, 256);
  const index = new Map(palette.map((colour, i) => [colour, i]));
  const channels = (colour) => colour.split(",").map(Number);
  for (const colour of byUse.slice(256)) {
    const [r, g, b] = channels(colour);
    const distance = (kept) => {
      const [kr, kg, kb] = channels(kept);
      return (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;
    };
    const nearest = palette.reduce((best, kept) => (distance(kept) < distance(best) ? kept : best));
    index.set(colour, index.get(nearest));
  }
  const rows = Buffer.alloc((width + 1) * height);
  art.forEach((colour, i) => (rows[Math.floor(i / width) * (width + 1) + 1 + (i % width)] = index.get(colour)));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 3, 0, 0, 0], 8);
  const rgb = palette.map((colour) => {
    const [r, g, b, a] = channels(colour);
    if (a !== 255) throw new Error("the scene has a transparent pixel");
    return [r, g, b];
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", Buffer.from(rgb.flat())),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
for (const [name, viewport, deviceScaleFactor] of STILLS) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  await page.addInitScript(controlTime);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".walk-view")?.classList.contains("is-laid-out"), null, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((done) => setTimeout(done, 1500));
  await page.evaluate(() => {
    const marks = document.querySelectorAll(".walk-timeline button");
    marks[marks.length - 1].click();
    window.advanceFrames(8000);
    marks[0].click();
    window.advanceFrames(8000);
  });
  const [found, total] = (await page.textContent(".walk-toolkit-count")).match(/\d+/g).map(Number);
  if (found !== total) throw new Error(`the walk to the cabin collected ${found} of ${total} gems`);
  const still = await page.evaluate(() => {
    const view = document.querySelector(".walk-view");
    const scale = Number(getComputedStyle(view).getPropertyValue("--scale"));
    const soil = Number(view.style.getPropertyValue("--soil"));
    if (!soil) throw new Error("the walk set no --soil");
    const [sky, ...rest] = view.querySelectorAll(".walk-canvas");
    const scene = new OffscreenCanvas(sky.width, sky.height - soil);
    const c = scene.getContext("2d");
    const frame = view.getBoundingClientRect();
    const top = frame.bottom - sky.height * scale;
    for (const canvas of [sky, ...rest]) {
      const box = canvas.getBoundingClientRect();
      const [x, y] = [(box.left - frame.left) / scale, (box.top - top) / scale];
      if (Math.abs(x - Math.round(x)) > 0.05 || Math.abs(y - Math.round(y)) > 0.05) throw new Error("a canvas sits between art pixels");
      c.drawImage(canvas, Math.round(x), Math.round(y));
    }
    const data = c.getImageData(0, 0, scene.width, scene.height).data;
    const art = [];
    for (let i = 0; i < data.length; i += 4) art.push(data.slice(i, i + 4).join());
    return { width: scene.width, height: scene.height, scale, soil, art };
  });
  await context.close();
  writeFileSync(`${out}/${name}.png`, indexedPng(still));
  console.log(`${name}.png: ${still.width}x${still.height} art pixels at scale ${still.scale} without ${still.soil} rows of soil, top row ${still.art[0]}`);
}
await browser.close();
