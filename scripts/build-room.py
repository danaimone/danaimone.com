#!/usr/bin/env python3
"""Build the cabin's plate and animation layers from locked art.

Every frame is an edit of one master. Each is sampled on the master's grid,
mapped to the master's palette, and kept only where it differs inside its
layer's box, so nothing outside a layer can move.

    build-room.py ~/danaimone-art public/game src/components/game/room-layouts.json
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageColor

DIFF = 34
GRID = 4 / 3
PALETTE_COLORS = 160


def on_grid(*values):
    return tuple(round(value * GRID) for value in values)


ROOMS = {
    "wide": {"size": (853, 480), "fire": on_grid(529, 156, 589, 231), "hands": on_grid(345, 170, 415, 200), "dog": on_grid(450, 210, 590, 285), "window": on_grid(24, 16, 280, 180), "fireFloorRank": 0.5, "bench": {"file": "bench-102.png", "at": (28, 272), "cleared": [((96, 300, 123, 348), (78, 96)), ((123, 288, 141, 348), (142, 154))]}, "fireSeed": 51, "sleepSeed": 91, "railTop": 289, "lakeSeed": (263, 225), "hazel": [((46, 41), "#a07a2e"), ((47, 40), "#7d8a42"), ((47, 41), "#7d8a42")], "face": ("face-wide-64.png", (448, 150)), "city": (198, 192, 312, 214), "lake": (226, 213, 300, 241), "revised": [(450, 143, 512, 217), (676, 409, 772, 458), (786, 230, 853, 345)]},
    "tall": {"size": (480, 853), "fire": on_grid(295, 356, 338, 443), "hands": on_grid(120, 365, 195, 395), "dog": on_grid(170, 440, 325, 515), "window": on_grid(22, 135, 178, 300), "fireFloorRank": 0.75, "fireSeed": 52, "sleepSeed": 92, "railTop": 572, "lakeSeed": (142, 368), "hazel": [((43, 29), "#a07a2e"), ((44, 29), "#a07a2e"), ((45, 29), "#7d8a42"), ((45, 30), "#7d8a42"), ((45, 31), "#7d8a42")], "face": ("face-tall-61.png", (108, 400)), "city": (103, 335, 178, 362), "lake": (112, 356, 172, 382), "revised": [(110, 403, 170, 460), (358, 772, 442, 822), (420, 505, 480, 665)]},
}
FIRE_FRAMES = 8
LOG_MIN_LIGHT = 66
TYPE_FRAMES = 4
SLEEP_FRAMES = 8
STAR_GAP = 4
SIDE_CORNER_DROP = 2
MIN_LAKE_SPAN = 6
WATER_MAX_BLUE = 172
LIGHT_GAP = 3


def sampled(path, size):
    image = Image.open(path).convert("RGB")
    width, height = size
    cell_x, cell_y = image.width / width, image.height / height
    source = image.load()
    out = Image.new("RGB", size)
    target = out.load()
    for y in range(height):
        for x in range(width):
            votes = {}
            cx, cy = (x + 0.5) * cell_x, (y + 0.5) * cell_y
            for dy in (-cell_y / 4, 0, cell_y / 4):
                for dx in (-cell_x / 4, 0, cell_x / 4):
                    p = source[min(image.width - 1, int(cx + dx)), min(image.height - 1, int(cy + dy))]
                    votes.setdefault((p[0] // 12, p[1] // 12, p[2] // 12), []).append(p)
            group = max(votes.values(), key=len)
            target[x, y] = tuple(sum(p[i] for p in group) // len(group) for i in range(3))
    return out


def key_mask(image, test):
    px = image.load()
    mask = {(x, y) for y in range(image.height) for x in range(image.width) if test(*px[x, y])}
    grown = set(mask)
    for x, y in mask:
        grown.update({(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)})
    return grown


def box_of(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs) + 1, "height": max(ys) - min(ys) + 1}


def bottom_right(points):
    """Extrapolate along the bottom edge, since a plant can hide the true corner."""
    bottoms = {}
    for x, y in points:
        bottoms[x] = max(y, bottoms.get(x, y))
    left, right = min(bottoms), max(bottoms)
    span = right - left
    near, far = left + span // 4, left + span // 2
    slope = (bottoms[far] - bottoms[near]) / (far - near)
    return {"x": right, "y": round(bottoms[far] + slope * (right - far))}


def corners(points):
    pick = lambda key: dict(zip("xy", key(points)))
    return {
        "topLeft": pick(lambda p: min(p, key=lambda q: q[0] + q[1])),
        "topRight": pick(lambda p: max(p, key=lambda q: q[0] - q[1])),
        "bottomLeft": pick(lambda p: min(p, key=lambda q: q[0] - q[1])),
        "bottomRight": bottom_right(points),
    }


def stretched_down(points, drop):
    """Pull the bottom-left corner down, keeping the bottom-right fixed."""
    shape = corners(points)
    left, right = shape["bottomLeft"], shape["bottomRight"]
    bottoms = {}
    for x, y in points:
        bottoms[x] = max(y, bottoms.get(x, y))
    span = right["x"] - left["x"]
    grown = set(points)
    for x in range(left["x"], left["x"] + span * 3 // 5):
        edge = left["y"] + drop + (right["y"] - left["y"] - drop) * (x - left["x"]) / span
        grown.update((x, y) for y in range(bottoms[x] + 1, round(edge) + 1))
    return grown


def mask_image(points, box):
    out = Image.new("RGBA", (box["width"], box["height"]))
    px = out.load()
    for x, y in points:
        px[x - box["x"], y - box["y"]] = (255, 255, 255, 255)
    return out


def fur_near(plate, box):
    x0, y0, x1, y1 = box
    px = plate.load()
    fur = {(x, y) for y in range(y0, y1) for x in range(x0, x1) if px[x, y][0] > 170 and px[x, y][1] > 140 and px[x, y][2] > 100}
    grown = set(fur)
    for x, y in fur:
        grown.update((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    return grown


def fixed_logs(plate, box):
    """The master's logs and grate; they never change between fire frames."""
    x0, y0, x1, y1 = box
    px = plate.load()
    middle = y0 + (y1 - y0) * 0.45
    bright = {
        (x, y) for y in range(int(middle), y1) for x in range(x0, x1)
        if sum(px[x, y]) / 3 > LOG_MIN_LIGHT
    }
    logs = largest_region(bright)
    top = {x: min(y for lx, y in logs if lx == x) for x in {p[0] for p in logs}}
    return logs, top


def is_mauve(color):
    r, g, b = color
    return r > 110 and b >= g * 0.85 and r - b < 75


def fire_strip(art, name, plate, spec):
    """PixelLab's looped fire over one frame of logs, so only the flames move."""
    x0, y0, x1, y1 = box = spec["fire"]
    keep = fur_near(plate, (x0, y0 + (y1 - y0) // 2, x1, y1))
    logs, top = fixed_logs(plate, box)
    floor = sorted(top.values())[int(len(top) * spec["fireFloorRank"])]
    frames = [Image.open(art / "pixellab" / f"fire-{name}-{spec['fireSeed']}-{i}.png").convert("RGB") for i in range(FIRE_FRAMES)]
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * FIRE_FRAMES, height))
    out = strip.load()
    first = frames[0].load()
    for index, frame in enumerate(frames):
        raw = frame.load()
        for y in range(height):
            for x in range(width):
                point = (x + x0, y + y0)
                behind_rail = y + y0 >= spec["railTop"]
                if point in keep or behind_rail or (y + y0 >= floor and point not in logs):
                    continue
                color = (first if point in logs else raw)[x, y]
                if not is_mauve(color):
                    out[index * width + x, y] = color + (255,)
    return strip


def layer_strip(frames, plate, box, palette_image):
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * len(frames), height))
    out = strip.load()
    base = plate.load()
    for index, frame in enumerate(frames):
        mapped = frame.quantize(palette=palette_image, dither=Image.Dither.NONE).convert("RGB").load()
        raw = frame.load()
        for y in range(y0, y1):
            for x in range(x0, x1):
                if sum(abs(a - b) for a, b in zip(raw[x, y], base[x, y])) > DIFF:
                    out[index * width + x - x0, y - y0] = mapped[x, y] + (255,)
    return strip


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


def sleeping_strip(art, name, plate, spec):
    """PixelLab's breathing loop, limited to Mishka so the rug stays still."""
    x0, y0, x1, y1 = spec["dog"]
    px = plate.load()
    fur = largest_region({
        (x, y) for y in range(y0, y1) for x in range(x0, x1)
        if px[x, y][0] > 190 and px[x, y][1] > 165 and px[x, y][2] > 110
    })
    mask = {(x + dx, y + dy) for x, y in fur for dx in range(-3, 4) for dy in range(-3, 4)}
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * SLEEP_FRAMES, height))
    out = strip.load()
    for index in range(SLEEP_FRAMES):
        frame = Image.open(art / "pixellab" / f"sleep-{name}-{spec['sleepSeed']}-{index}.png").convert("RGB").load()
        for y in range(height):
            for x in range(width):
                if (x + x0, y + y0) in mask:
                    out[index * width + x, y] = frame[x, y] + (255,)
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


def sparkles(plate, window, city_box):
    x0, y0, x1, y1 = window
    px = plate.load()
    sky_end = int(y0 + (y1 - y0) * 0.45)
    stars = [
        (x, y)
        for y in range(y0 + 3, sky_end)
        for x in range(x0 + 3, x1 - 3)
        if min(px[x, y][:2]) > 175 and px[x, y][2] > 150 and night_around(px, x, y)
    ]
    cx0, cy0, cx1, cy1 = city_box
    city = [
        (x, y)
        for y in range(cy0, cy1)
        for x in range(cx0, cx1)
        if px[x, y][0] > 170 and px[x, y][1] > 105 and px[x, y][2] < 140
    ]
    return spaced(stars, STAR_GAP), spaced(city, LIGHT_GAP)


def is_water(color):
    r, g, b = color
    return r < 75 and 40 < g < 100 and 130 < b < WATER_MAX_BLUE


def lake_spans(plate, box, seed):
    x0, y0, x1, y1 = box
    px = plate.load()
    water, frontier = {seed}, deque([seed])
    while frontier:
        x, y = frontier.popleft()
        for point in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            inside = x0 <= point[0] < x1 and y0 <= point[1] < y1
            if inside and point not in water and is_water(px[point]):
                water.add(point)
                frontier.append(point)
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


def replace_bench(master, art, bench):
    px = master.load()
    for (x0, y0, x1, y1), (clean_start, clean_end) in bench["cleared"]:
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = px[clean_start + (x - x0) % (clean_end - clean_start), y]
    sprite = Image.open(art / "pixellab" / bench["file"]).convert("RGBA")
    master.paste(sprite.convert("RGB"), bench["at"], sprite.getchannel("A"))


def build(art, out, name, spec):
    size = spec["size"]
    master = sampled(art / f"master-{name}.locked.png", size)
    revision = sampled(art / f"master-{name}5.png", size)
    for area in spec["revised"]:
        master.paste(revision.crop(area), area[:2])
    if "bench" in spec:
        replace_bench(master, art, spec["bench"])
    face_file, face_at = spec["face"]
    face = Image.open(art / "pixellab" / face_file).convert("RGBA")
    for point, color in spec["hazel"]:
        face.putpixel(point, ImageColor.getrgb(color) + (255,))
    master.paste(face.convert("RGB"), face_at, face.getchannel("A"))
    magenta = key_mask(master, lambda r, g, b: r > 170 and b > 170 and g < 90)
    cyan = key_mask(master, lambda r, g, b: g > 170 and b > 170 and r < 90)
    cyan = stretched_down(cyan, SIDE_CORNER_DROP)
    main, side = box_of(magenta), box_of(cyan)

    plate_rgb = master.copy()
    px = plate_rgb.load()
    for x, y in magenta | cyan:
        px[x, y] = (30, 30, 46)
    palette_image = plate_rgb.quantize(colors=PALETTE_COLORS, dither=Image.Dither.NONE)
    plate = palette_image.convert("RGB")

    typing = [sampled(art / f"{name}-type-{i}.png", size) for i in range(1, TYPE_FRAMES + 1)]
    fire_strip(art, name, plate_rgb, spec).save(out / f"room-{name}-fire.png", optimize=True)
    layer_strip(typing, plate_rgb, spec["hands"], palette_image).save(out / f"room-{name}-hands.png", optimize=True)
    sleeping_strip(art, name, plate, spec).save(out / f"room-{name}-mishka.png", optimize=True)
    mask_image(magenta, main).save(out / f"room-{name}-screen.png", optimize=True)
    mask_image(cyan, side).save(out / f"room-{name}-side.png", optimize=True)
    plate.save(out / f"interior{'' if name == 'wide' else '-tall'}.png", optimize=True)

    stars, city = sparkles(plate, spec["window"], spec["city"])
    box = lambda b: {"x": b[0], "y": b[1], "width": b[2] - b[0], "height": b[3] - b[1]}
    return {
        "width": size[0], "height": size[1], "main": main, "side": side,
        "mainCorners": corners(magenta), "sideCorners": corners(cyan),
        "fireBox": box(spec["fire"]), "fireFrames": FIRE_FRAMES,
        "handsBox": box(spec["hands"]), "handFrames": TYPE_FRAMES,
        "mishkaBox": box(spec["dog"]), "mishkaFrames": SLEEP_FRAMES, "stars": stars, "city": city, "lake": lake_spans(plate, spec["lake"], spec["lakeSeed"]),
    }


def main():
    art, out, manifest = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    layouts = {name: build(art, out, name, spec) for name, spec in ROOMS.items()}
    manifest.write_text(json.dumps(layouts, indent=2) + "\n")
    for name, layout in layouts.items():
        print(name, layout["main"], layout["side"], len(layout["stars"]), len(layout["city"]))


if __name__ == "__main__":
    main()
