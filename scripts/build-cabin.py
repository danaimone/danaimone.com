#!/usr/bin/env python3
"""Build the cabin's plate and animation layers from one painted scene per layout.

Each layout is one painting on the art grid, used as painted: nothing is pasted onto it. The monitors are painted as
flat key colours and become the screen masks. Every animation layer is cut from the plate or drawn to fit it; the fire burns in the page, from the hearth measured here.

    build-cabin.py ~/danaimone-art public/game src/components/game/room-layouts.json
"""
import json
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageColor

SCREEN_GLASS = (30, 30, 46)
PALETTE_COLORS = 256
SLEEP_FRAMES = 8
BREATH_PIXELS = 2
RIB_SPAN = (0.3, 0.7)
RIB_DEPTH = 18
STAR_GAP = 4
STAR_PIXELS = 3
STAR_CLEARANCE = 8
LIGHT_GAP = 3
MIN_LAKE_SPAN = 6
FLAME_TUCK = 4
FIRE_SPREAD = 4
WRIST_REST = ["#2a120a", "#a8663a", "#844622", "#5e2e14", "#4a1a08"]
CASE_END = ["#844622", "#5e2e14"]

ROOMS = {
    "wide": {
        "source": "wide-standing.png",
        "fire": {"opening": (537, 153, 603, 232), "grateTop": 226, "logRim": [(544, 217), (550, 211), (560, 206), (570, 201), (578, 199), (582, 203), (585, 210), (590, 215), (592, 221)]},
        "dog": (455, 262, 570, 330), "snore": (552, 270), "snoreDrift": -12,
        "window": (110, 47, 262, 179), "starLight": 150, "city": (150, 148, 240, 162), "lake": (140, 160, 250, 179),
        "coffee": (461, 146), "candles": [(530, 83), (543, 89)],
        "blink": (356, 95, 2, 2),
        "hands": (384, 138, 410, 162), "wristRest": (385, 160, 431), "caseEnd": (432, 150, 158),
        "taps": {"origin": (316, 105), "frames": ["tap-wide-f1.png", "tap-wide-n1.png", "tap-wide-f2.png", "tap-wide-n2.png", "tap-wide-f3.png"]},
    },
    "tall": {
        "source": "tall-standing.png",
        "fire": {"opening": (269, 381, 332, 474), "grateTop": 458, "logRim": [(270, 452), (278, 444), (293, 435), (307, 429), (312, 431), (316, 436), (322, 441), (328, 449)]},
        "dog": (180, 512, 312, 592), "snore": (272, 526), "snoreDrift": -10,
        "window": (18, 164, 142, 298), "starLight": 150, "city": (55, 256, 125, 272), "lake": (40, 268, 125, 298),
        "coffee": (200, 409), "candles": [(266, 315), (280, 321)],
        "blink": (93, 341, 2, 2),
        "hands": (114, 400, 146, 424), "wristRest": (125, 421, 168), "caseEnd": (168, 412, 420),
        "taps": {"origin": (50, 367), "frames": ["tap-tall-f1.png", "tap-tall-n1.png", "tap-tall-f2.png", "tap-tall-n2.png", "tap-tall-f3.png"]},
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


def hearth(fire):
    """What the page needs to burn its own fire: the flame floor of each column and where along the logs the heat is fed."""
    x0, y0, x1, y1 = fire["opening"]
    floor = flame_floor(fire)
    rim = fire["logRim"]
    return {
        "floor": [floor[x] - y0 for x in range(x0, x1)],
        "middle": (rim[0][0] + rim[-1][0]) / 2 - x0,
        "reach": (rim[-1][0] - rim[0][0]) / 2 + FIRE_SPREAD,
    }


def walnut_keyboard(indexed, spec):
    """Dan's keyboard has a walnut case and wrist rest. The painter drew a black case with a grey strip in front,
    so the strip is redrawn as a walnut slab (a gap below the keys, a lit top, two rows of wood and the shadow it
    casts on the desk) and the end of the case that faces us is recoloured to match. It is drawn in the plate's
    own colours, after they are chosen, so the rest of the painting keeps every pixel."""
    colours = indexed.getpalette()
    swatches = [tuple(colours[i:i + 3]) for i in range(0, len(colours), 3)]

    def nearest(ink):
        wanted = ImageColor.getrgb(ink)
        return min(range(len(swatches)), key=lambda i: sum((a - b) ** 2 for a, b in zip(swatches[i], wanted)))

    px = indexed.load()
    x, top, bottom = spec["caseEnd"]
    for column, ink in enumerate(CASE_END):
        for y in range(top, bottom):
            px[x + column, y] = nearest(ink)
    x0, y0, x1 = spec["wristRest"]
    for row, ink in enumerate(WRIST_REST):
        rounded = row in (1, 3)
        for x in range(x0 + rounded, x1 - rounded):
            px[x, y0 + row] = nearest(ink)


def typing_strip(art, spec):
    """One painted frame per tap: a finger or two of one hand raised off the keys or pressed in, with the hand itself
    still. Each is a patch holding only the finger pixels that differ from the plate, so nothing else can move."""
    x0, y0, x1, y1 = spec["hands"]
    width, height = x1 - x0, y1 - y0
    frames = spec["taps"]["frames"]
    strip = Image.new("RGBA", (width * len(frames), height))
    ox, oy = spec["taps"]["origin"]
    for hand, frame in enumerate(frames):
        tap = Image.open(art / "cabin2" / frame).convert("RGBA")
        left, top, right, bottom = tap.getbbox()
        assert x0 <= ox + left and ox + right <= x1 and y0 <= oy + top and oy + bottom <= y1, "the tap leaves the hands box"
        strip.alpha_composite(tap, (hand * width + ox - x0, oy - y0))
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


def speck(bright, x, y):
    """A star is a bright speck alone in the sky. The mountain's snow and the moon are bright too, but they are big,
    and a loose fleck of snow sits close beside them."""
    seen, queue = {(x, y)}, deque([(x, y)])
    while queue and len(seen) <= STAR_PIXELS:
        cx, cy = queue.popleft()
        for n in ((cx + dx, cy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            if n not in seen and bright(*n):
                seen.add(n)
                queue.append(n)
    return len(seen) <= STAR_PIXELS


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
    bright = lambda x, y: min(px[x, y][:2]) > light and px[x, y][2] > light - 25
    lit = [(x, y) for y in range(y0 + 3, y1 - 3) for x in range(x0 + 3, x1 - 3) if bright(x, y)]
    bodies = [point for point in lit if not speck(bright, *point)]
    clear = lambda x, y: all(max(abs(x - bx), abs(y - by)) > STAR_CLEARANCE for bx, by in bodies)
    stars = [(x, y) for x, y in lit if y < sky_end and night_around(px, x, y) and speck(bright, x, y) and clear(x, y)]
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
    # The painter shades the key colour at a screen's edge, so the darker shades count as screen too.
    magenta = keyed(plate, lambda r, g, b: r > 75 and b > 75 and g < 50)
    cyan = keyed(plate, lambda r, g, b: g > 70 and b > 75 and r < 50)
    main, side = box_of(magenta), box_of(cyan)
    px = plate.load()
    for point in magenta | cyan:
        px[point] = SCREEN_GLASS
    indexed = plate.quantize(colors=PALETTE_COLORS, dither=Image.Dither.NONE)
    walnut_keyboard(indexed, spec)
    plate = indexed.convert("RGB")

    typing_strip(art, spec).save(out / f"room-{name}-hands.png", optimize=True)
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
        "fireBox": box(spec["fire"]["opening"]), "hearth": hearth(spec["fire"]),
        "handsBox": box(spec["hands"]), "typingFrames": len(spec["taps"]["frames"]),
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
