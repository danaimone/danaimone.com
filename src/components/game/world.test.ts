import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { experience } from "../../data/resume";
import { CLOUD_KINDS, DAN_SHEET, MISHKA_SHEET, PROP_SHEET, TREE_SHEET } from "./sheets";
import layouts from "./room-layouts.json";
import { fractionOf, worldAt } from "./track";
import { BEACON, CHIMNEY, DOOR, GEMS, LANDMARKS, PROMOTION_X, STOPS, TIMELINE, onLandmark, spriteTop } from "./world";

function pngSize(name: string) {
  const file = readFileSync(`public/game/${name}.png`);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

const atlassianStop = STOPS.find((stop) => stop.id === "atlassian");

describe("career stops", () => {
  test("every job has a stop, oldest first", () => {
    expect(STOPS.map((stop) => stop.id)).toEqual(experience.map((stop) => stop.id).reverse());
    const xs = STOPS.map((stop) => stop.markerX);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test("zones do not overlap and each holds its timeline mark", () => {
    STOPS.forEach((stop, i) => {
      expect(stop.markerX).toBeGreaterThanOrEqual(stop.zone.from);
      expect(stop.markerX).toBeLessThanOrEqual(stop.zone.to);
      if (i > 0) expect(stop.zone.from).toBeGreaterThan(STOPS[i - 1].zone.to);
    });
  });

  test("timeline years are years only, from the résumé", () => {
    const captions = TIMELINE.map((mark) => mark.caption);
    expect(captions).toEqual(["Back to", "2017", "2022", "2022", "2025", "Now"]);
  });

  test("the promotion happens at Atlassian", () => {
    expect(atlassianStop && PROMOTION_X >= atlassianStop.zone.from && PROMOTION_X <= atlassianStop.zone.to).toBe(true);
  });

  test("gem labels are unique and on the walk", () => {
    expect(new Set(GEMS.map((gem) => gem.label)).size).toBe(GEMS.length);
    const end = worldAt(fractionOf({ kind: "cabin" }));
    for (const gem of GEMS) expect(gem.x).toBeLessThan(end);
  });
});

describe("art matches the code", () => {
  test("landmark sizes match their PNGs", () => {
    for (const landmark of LANDMARKS) {
      expect(pngSize(landmark.name)).toEqual({ width: landmark.width, height: landmark.height });
      if (landmark.lights) expect(pngSize(`${landmark.name}-lights`)).toEqual({ width: landmark.width, height: landmark.height });
    }
  });

  test("signs fit on their buildings and their logos exist", () => {
    for (const { sign, width, height } of LANDMARKS) {
      if (!sign) continue;
      expect(sign.x + sign.size).toBeLessThanOrEqual(width);
      expect(sign.y + sign.size).toBeLessThanOrEqual(height);
      expect(pngSize(`logos/${sign.logo}`).width).toBe(sign.size);
    }
  });

  test("sprite sheets divide evenly into frames", () => {
    expect(pngSize("dan")).toEqual({ width: DAN_SHEET.width * 14, height: DAN_SHEET.height });
    expect(pngSize("mishka")).toEqual({ width: MISHKA_SHEET.width * 13, height: MISHKA_SHEET.height });
    expect(pngSize("trees").height).toBe(TREE_SHEET.height);
    expect(pngSize("props")).toEqual({ width: PROP_SHEET.width * PROP_SHEET.count, height: PROP_SHEET.height });
    expect(pngSize("clouds").width % CLOUD_KINDS).toBe(0);
  });

  test("anchors sit on their landmarks", () => {
    const cabin = LANDMARKS.find((landmark) => landmark.name === "cabin");
    const labsNow = LANDMARKS.find((landmark) => landmark.name === "labsnow");
    expect(cabin && onLandmark(cabin, { x: 0, y: 0 }).y).toBe(cabin && spriteTop(cabin));
    expect(cabin && DOOR.x >= cabin.x && DOOR.x + DOOR.width <= cabin.x + cabin.width).toBe(true);
    expect(cabin && DOOR.y + DOOR.height).toBeLessThanOrEqual(2);
    expect(cabin && CHIMNEY.x < cabin.x + cabin.width).toBe(true);
    expect(labsNow && BEACON.x < labsNow.x + labsNow.width).toBe(true);
  });
});

describe("cabin rooms", () => {
  const files = { wide: "interior", tall: "interior-tall" };

  for (const name of ["wide", "tall"] as const) {
    const room = layouts[name];

    test(`${name} layers match the manifest`, () => {
      expect(pngSize(files[name])).toEqual({ width: room.width, height: room.height });
      expect(room.hearth.floor).toHaveLength(room.fireBox.width);
      expect(pngSize(`room-${name}-hands`)).toEqual({ width: room.handsBox.width * room.typingFrames, height: room.handsBox.height });
      expect(pngSize(`room-${name}-mishka`).width).toBe(room.mishkaBox.width * room.mishkaFrames);
      expect(pngSize(`room-${name}-screen`)).toEqual({ width: room.main.width, height: room.main.height });
      expect(pngSize(`room-${name}-side`)).toEqual({ width: room.side.width, height: room.side.height });
    });

    test(`${name} monitors sit inside the room, side by side`, () => {
      expect(room.main.x + room.main.width).toBeLessThanOrEqual(room.side.x);
      expect(room.side.x + room.side.width).toBeLessThanOrEqual(room.width);
    });
  }
});
