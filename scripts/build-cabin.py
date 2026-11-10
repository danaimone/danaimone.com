#!/usr/bin/env python3
"""Build the cabin's plate and animation layers from one painted scene per layout.

Each layout is one painting on the art grid, used as painted: nothing is pasted onto it. The monitors are painted as
flat key colours and become the screen masks. Every animation layer is cut from the plate or drawn to fit it.

    build-cabin.py ~/danaimone-art public/game src/components/game/room-layouts.json
"""
import json
import math
import random
import sys
from collections import deque
from pathlib import Path

from PIL import Image

SCREEN_GLASS = (30, 30, 46)
PALETTE_COLORS = 256
FIRE_FRAMES = 16
SLEEP_FRAMES = 8
BREATH_PIXELS = 2
RIB_SPAN = (0.3, 0.7)
RIB_DEPTH = 18
STAR_GAP = 4
LIGHT_GAP = 3
MIN_LAKE_SPAN = 6
FLAME_TUCK = 4
FLAME_INKS = [(44, (255, 240, 180)), (32, (255, 204, 92)), (19, (255, 150, 40)), (8, (232, 92, 24))]
FIRE_HEAT = 64
FIRE_STEADY = 0.45
FIRE_COOLING = (0, 1, 1, 1, 2)
FIRE_DRIFT = (-1, 0, 0, 1)
FIRE_SPREAD = 4
FIRE_WARM_UP = 80

ROOMS = {
    "wide": {
        "source": "wide.png",
        "fire": {"opening": (537, 153, 603, 232), "grateTop": 226, "logRim": [(544, 217), (550, 211), (560, 206), (570, 201), (578, 199), (582, 203), (585, 210), (590, 215), (592, 221)], "seed": 51},
        "dog": (455, 262, 570, 330), "snore": (552, 270), "snoreDrift": -12,
        "window": (110, 47, 262, 179), "starLight": 150, "city": (150, 148, 240, 162), "lake": (140, 160, 250, 179),
        "coffee": (462, 182), "candles": [(530, 83), (543, 89)],
        "blink": (354, 138, 2, 2),
        "hands": (384, 172, 414, 192), "presses": [(396, 176, 404, 186), (402, 174, 412, 184)],
    },
    "tall": {
        "source": "tall.png",
        "fire": {"opening": (269, 381, 332, 474), "grateTop": 458, "logRim": [(270, 452), (278, 444), (293, 435), (307, 429), (312, 431), (316, 436), (322, 441), (328, 449)], "seed": 52},
        "dog": (180, 512, 312, 592), "snore": (272, 526), "snoreDrift": -10,
        "window": (18, 164, 142, 298), "starLight": 150, "city": (55, 256, 125, 272), "lake": (40, 268, 125, 298),
        "coffee": (200, 423), "candles": [(266, 315), (280, 321)],
        "blink": (81, 367, 2, 2),
        "hands": (120, 412, 150, 436), "presses": [(128, 416, 136, 428), (134, 414, 144, 426)],
    },
}


def largest_region(points):
    remaining, best = set(points), set()
    while remaining:
        start = remaining.pop()
        seen, queue = {start}, deque([start])
        while queue:
            x, y = queue.popleft()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in remaining:
                    remaining.remove(n)
                    seen.add(n)
                    queue.append(n)
        if len(seen) > len(best):
            best = seen
    return best


def keyed(plate, test):
    px = plate.load()
    return largest_region({(x, y) for y in range(plate.height) for x in range(plate.width) if test(*px[x, y])})


def box_of(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs) + 1, "height": max(ys) - min(ys) + 1}


def corners(box):
    x0, y0, x1, y1 = box["x"], box["y"], box["x"] + box["width"], box["y"] + box["height"]
    return {"topLeft": {"x": x0, "y": y0}, "topRight": {"x": x1, "y": y0}, "bottomLeft": {"x": x0, "y": y1}, "bottomRight": {"x": x1, "y": y1}}


def mask_image(points, box):
    out = Image.new("RGBA", (box["width"], box["height"]))
    px = out.load()
    for x, y in points:
        px[x - box["x"], y - box["y"]] = (255, 255, 255, 255)
    return out


def flame_floor(fire):
    """The lowest row a flame may reach in each column: just over the logs' top edge, or the grate beside them. The
    edge is measured off the painting, because the fire-lit brick behind the logs is as bright as the logs are."""
    x0, _, x1, _ = fire["opening"]
    rim = fire["logRim"]
    floor = {}
    for x in range(x0, x1):
        span = next(((a, b) for a, b in zip(rim, rim[1:]) if a[0] <= x <= b[0]), None)
        if span is None:
            floor[x] = fire["grateTop"]
            continue
        (ax, ay), (bx, by) = span
        floor[x] = round(ay + (by - ay) * (x - ax) / (bx - ax)) + FLAME_TUCK
    return floor


def fire_strip(fire):
    """A looped pixel fire behind the painted logs. Heat is fed in along the logs' top edge, hottest in the middle, and
    each cell takes the heat of a cell just below it, shifted a column either way and cooled by a random step. The feed
    swells and fades along the logs, so the heat rises as separate tongues, and each pixel is inked from the average
    heat around it, so a tongue has a clean edge. Frames are consecutive steps: the loop's seam is one more flicker."""
    x0, y0, x1, y1 = fire["opening"]
    floor = flame_floor(fire)
    width, height = x1 - x0, y1 - y0
    rim = fire["logRim"]
    middle, reach = (rim[0][0] + rim[-1][0]) / 2, (rim[-1][0] - rim[0][0]) / 2 + FIRE_SPREAD
    rand = random.Random(fire["seed"])
    heat = [[0] * width for _ in range(height)]
    strip = Image.new("RGBA", (width * FIRE_FRAMES, height))
    out = strip.load()
    for step in range(FIRE_WARM_UP + FIRE_FRAMES):
        for x in range(width):
            off_centre = min(1.0, abs(x + x0 - middle) / reach)
            lick = 0.5 + 0.5 * math.sin(x * 0.55 + step * 0.8) * math.sin(x * 0.23 - step * 0.45 + 1.3)
            fuel = FIRE_HEAT * (1 - off_centre ** 2) * (FIRE_STEADY + (1 - FIRE_STEADY) * lick)
            base = floor[x + x0] - y0
            for y in range(base, min(height, base + FLAME_TUCK + 1)):
                heat[y][x] = max(0, round(fuel * rand.uniform(0.7, 1)))
        for y in range(height - 1):
            for x in range(width):
                if y >= floor[x + x0] - y0:
                    continue
                source = min(width - 1, max(0, x + rand.choice(FIRE_DRIFT)))
                heat[y][x] = max(0, heat[y + 1][source] - rand.choice(FIRE_COOLING))
        frame = step - FIRE_WARM_UP
        if frame < 0:
            continue
        for y in range(height):
            for x in range(width):
                if y >= floor[x + x0] - y0:
                    continue
                near = [heat[ny][nx] for ny in (y - 1, y, y + 1) for nx in (x - 1, x, x + 1) if 0 <= ny < height and 0 <= nx < width and ny < floor[nx + x0] - y0]
                warmth = (sum(near) + heat[y][x]) / (len(near) + 1)
                color = next((ink for least, ink in FLAME_INKS if warmth >= least), None)
                if color:
                    out[frame * width + x, y] = color + (255,)
    return strip


def typing_strip(plate, spec):
    """One frame per pressed finger group: the fingers in its box drop one art pixel onto the keys."""
    x0, y0, x1, y1 = spec["hands"]
    width, height = x1 - x0, y1 - y0
    px = plate.load()
    strip = Image.new("RGBA", (width * len(spec["presses"]), height))
    out = strip.load()
    for index, (px0, py0, px1, py1) in enumerate(spec["presses"]):
        for y in range(py0, py1):
            for x in range(px0, px1):
                out[index * width + x - x0, y - y0] = px[x, max(py0, y - 1)] + (255,)
    return strip


def sleeping_strip(plate, spec):
    """Swell the fur over Mishka's ribs on a breathing curve; head and tail never move."""
    x0, y0, x1, y1 = spec["dog"]
    px = plate.load()
    fur = largest_region({
        (x, y) for y in range(y0, y1) for x in range(x0, x1)
        if px[x, y][0] > 190 and px[x, y][1] > 165 and px[x, y][2] > 110
    })
    left, right = min(p[0] for p in fur), max(p[0] for p in fur)
    rib_start = left + (right - left) * RIB_SPAN[0]
    rib_end = left + (right - left) * RIB_SPAN[1]
    tops = {}
    for x, y in fur:
        tops[x] = min(y, tops.get(x, y))
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * SLEEP_FRAMES, height))
    out = strip.load()
    for index in range(SLEEP_FRAMES):
        inhale = math.sin(math.pi * index / SLEEP_FRAMES) ** 2
        for x in range(math.ceil(rib_start), math.floor(rib_end) + 1):
            top = tops.get(x)
            bell = math.sin(math.pi * (x - rib_start) / (rib_end - rib_start))
            lift = round(BREATH_PIXELS * bell * inhale)
            if top is None or lift == 0:
                continue
            for y in range(top - lift, top + RIB_DEPTH):
                source = top + (y - top + lift) * RIB_DEPTH // (RIB_DEPTH + lift)
                out[index * width + x - x0, y - y0] = px[x, source] + (255,)
    return strip


def night_around(px, x, y):
    ring = [px[x + dx, y + dy] for dx in (-3, 3) for dy in (-3, 3)]
    return all(b > r + 12 for r, g, b in ring)


def spaced(points, gap):
    kept = []
    for x, y in points:
        if all(abs(x - kx) + abs(y - ky) >= gap for kx, ky in kept):
            kept.append([x, y])
    return kept


def sparkles(plate, spec):
    x0, y0, x1, y1 = spec["window"]
    light = spec["starLight"]
    px = plate.load()
    sky_end = int(y0 + (y1 - y0) * 0.45)
    stars = [
        (x, y)
        for y in range(y0 + 3, sky_end)
        for x in range(x0 + 3, x1 - 3)
        if min(px[x, y][:2]) > light and px[x, y][2] > light - 25 and night_around(px, x, y)
    ]
    cx0, cy0, cx1, cy1 = spec["city"]
    city = [
        (x, y)
        for y in range(cy0, cy1)
        for x in range(cx0, cx1)
        if px[x, y][0] > 170 and px[x, y][1] > 105 and px[x, y][2] < 140 and night_around(px, x, y)
    ]
    return spaced(stars, STAR_GAP), spaced(city, LIGHT_GAP)


def is_water(color):
    r, g, b = color
    return r < 40 and g < 100 and b > 100 and b > g * 1.6


def lake_spans(plate, box):
    """The open water between the tree lines: the lake is the one connected body inside its box."""
    x0, y0, x1, y1 = box
    px = plate.load()
    water = largest_region({(x, y) for y in range(y0, y1) for x in range(x0, x1) if is_water(px[x, y])})
    spans = []
    for y in range(y0, y1):
        x = x0
        while x < x1:
            start = x
            while (x, y) in water:
                x += 1
            if x - start >= MIN_LAKE_SPAN:
                spans.append([start, y, x - start])
            x += 1
    return spans


def build(art, out, name, spec):
    plate = Image.open(art / "cabin2" / spec["source"]).convert("RGB")
    magenta = keyed(plate, lambda r, g, b: r > 170 and b > 170 and g < 90)
    cyan = keyed(plate, lambda r, g, b: g > 170 and b > 170 and r < 90)
    main, side = box_of(magenta), box_of(cyan)
    px = plate.load()
    for point in magenta | cyan:
        px[point] = SCREEN_GLASS
    indexed = plate.quantize(colors=PALETTE_COLORS, dither=Image.Dither.NONE)
    plate = indexed.convert("RGB")

    fire_strip(spec["fire"]).save(out / f"room-{name}-fire.png", optimize=True)
    typing_strip(plate, spec).save(out / f"room-{name}-hands.png", optimize=True)
    sleeping_strip(plate, spec).save(out / f"room-{name}-mishka.png", optimize=True)
    mask_image(magenta, main).save(out / f"room-{name}-screen.png", optimize=True)
    mask_image(cyan, side).save(out / f"room-{name}-side.png", optimize=True)
    indexed.save(out / f"interior{'' if name == 'wide' else '-tall'}.png", optimize=True)

    stars, city = sparkles(plate, spec)
    box = lambda b: {"x": b[0], "y": b[1], "width": b[2] - b[0], "height": b[3] - b[1]}
    point = lambda p: {"x": p[0], "y": p[1]}
    bx, by, bw, bh = spec["blink"]
    return {
        "width": plate.width, "height": plate.height, "main": main, "side": side,
        "mainCorners": corners(main), "sideCorners": corners(side),
        "fireBox": box(spec["fire"]["opening"]), "fireFrames": FIRE_FRAMES,
        "handsBox": box(spec["hands"]), "handFrames": len(spec["presses"]),
        "mishkaBox": box(spec["dog"]), "mishkaFrames": SLEEP_FRAMES, "stars": stars, "city": city, "lake": lake_spans(plate, spec["lake"]),
        "coffee": point(spec["coffee"]), "snore": point(spec["snore"]), "snoreDrift": spec["snoreDrift"], "candles": [point(c) for c in spec["candles"]],
        "blink": {"x": bx, "y": by, "width": bw, "height": bh},
    }


def main():
    art, out, manifest = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    only = sys.argv[4:] or list(ROOMS)
    existing = json.loads(manifest.read_text()) if manifest.exists() else {}
    layouts = {**existing, **{name: build(art, out, name, ROOMS[name]) for name in only}}
    manifest.write_text(json.dumps(layouts, indent=2) + "\n")
    for name in only:
        layout = layouts[name]
        print(name, layout["main"], layout["side"], len(layout["stars"]), len(layout["city"]), len(layout["lake"]))


if __name__ == "__main__":
    main()
