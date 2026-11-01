#!/usr/bin/env python3
"""Build the cabin's plate and animation layers from one painted scene per layout.

Each layout has one source image: the round-25 Codex painting of the whole room,
Dan at his desk included, drawn from a composite of the previous build. It is
sampled onto the art grid and quantized, and only what the painting cannot
carry goes on top: Dan's approved head, the keyboard sprite (the painted keys
turn to a blue smear at the art grid), the guitar strings (too thin to survive
sampling), white socks over the bare ankles, a neutral grade on the dock, and
the bench tools. Every animation layer is cut from that plate or drawn to fit it.

    build-room.py ~/danaimone-art public/game src/components/game/room-layouts.json
"""
import json
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageColor

PALETTE_COLORS = 160


HAZEL = [((46, 41), "#a07a2e"), ((47, 40), "#7d8a42"), ((47, 41), "#7d8a42")]
BLINK = {"x": 45, "y": 40, "width": 3, "height": 2}


ROOMS = {
    "wide": {
        "size": (853, 480), "source": "master-wide25b.png",
        "fire": (704, 206, 784, 306), "opening": (704, 784), "fireSeed": 51, "logTop": 262, "railTop": 304,
        "hands": (430, 225, 530, 265), "handArea": (44, 10, 72, 27), "typeSeed": 125,
        "dog": (630, 295, 790, 375), "snore": (704, 318), "snoreDrift": -22,
        "window": (56, 30, 385, 240), "starLight": 145, "city": (60, 198, 340, 211), "lake": (120, 209, 380, 236),
        "face": ("face-hd.png", (421, 149)),
        "shift": (418, 222, 478, 252),
        "coffee": (573, 236), "candles": [(690, 121), (706, 126)],
        "keyboard": (480, 236, 60, 4), "handGuard": (476, 230, 506, 252),
        "dock": (550, 241, 17, 3),
        "socks": [(467, 318, 9, 4), (482, 321, 11, 4)],
        "strings": {"top": (282, 198, 1.0), "bottom": (279, 262, 2.0), "bridge": 273},
        "tools": [(1, (745, 404)), (0, (690, 420)), (2, (792, 414))],
    },
    "tall": {
        "size": (480, 960), "source": "master-tall25g.png",
        "fire": (393, 474, 453, 592), "opening": (395, 451), "fireSeed": 52, "logTop": 540, "railTop": 590, "emberFade": True,
        "hands": (170, 480, 270, 520), "handArea": (34, 14, 66, 30), "typeSeed": 126,
        "dog": (230, 615, 430, 720), "snore": (372, 630), "snoreDrift": 0,
        "window": (30, 176, 248, 402), "starLight": 175, "city": (90, 338, 220, 354), "lake": (90, 352, 240, 400),
        "face": ("face-hd.png", (133, 397)),
        "shift": (126, 462, 190, 504),
        "coffee": (300, 507), "candles": [(396, 380), (408, 385)],
        "keyboard": (214, 497, 48, 4), "handGuard": (196, 490, 236, 512),
        "stack": {"dock": (273, 498, 20, 5), "magni": (276, 493, 13, 5)},
        "socks": [],
        "strings": {"top": (372, 138, 1.3), "bottom": (369, 218, 2.2), "bridge": 231},
        "tools": [],
    },
}
FIRE_FRAMES = 8
LOG_MIN_RED = 140
LOG_WARMTH = 60
TYPE_POSES = (1, 2, 5, 6, 7)
HAND_CHANGE = 30
SLEEP_FRAMES = 8
SHIFT_FRAMES = 2
TOOL_SHADOW = (58, 26, 12)
FIRELIGHT = (255, 150, 70)
FIRELIGHT_MIX = 0.12
BREATH_PIXELS = 3
RIB_SPAN = (0.24, 0.62)
RIB_DEPTH = 26
WALL_MAX_LIGHT = 150
EMBER_FADE = [(232, 117, 31), (214, 92, 26), (184, 72, 26)]
STAR_GAP = 4
MIN_LAKE_SPAN = 6
LIGHT_GAP = 3
BEZEL = (22, 22, 28)
BEZEL_MIN_LIGHT = 90
HEAD_TRIM = [(0, 18, 54, 76), (0, 24, 64, 76), (0, 30, 68, 76), (34, 68, 66, 76)]
SHIRT_MAX_SATURATION = 0.45
SHIRT_MIN_VALUE = 0.75
BEARD_ROWS = (50, 60)
BEARD_LIGHT = (25, 60)
CHIN_ROWS = (60, 64)
CHIN_MAX_LIGHT = 20
HALO_REACH = 3
HALO_REFERENCE = 5
HALO_LIKENESS = 0.6
KEY_CELL = 4
RECTANGLE_NOTCH = 4
SKIN_HUE = 18
RED_HUE = 14
RED_MIN_SATURATION = 0.5
MAUVE_BLUE = 0.75
SOCK = (236, 232, 226)
JACKET_HUE = (6, 32)
JACKET_SATURATION = (0.6, 1.0)
JACKET_VALUE = (0.3, 0.9)

INK = {
    "W": "#7a4220", "w": "#96572a", "M": "#e8d2aa", "P": "#1e1e22", "K": "#ece6da", "k": "#d9d2c4", "g": "#3c3a38",
    "c": "#f07660", "s": "#76b4ec", "l": "#baa0e8", "y": "#f2d05c", "m": "#8adcb4",
    "B": "#16161a", "b": "#2c2c32", "h": "#4a4a52", "L": "#f4f8ff", "S": "#bcbec4", "T": "#dcdee4", "D": "#8e9096", "p": "#2a2a30",
}
STRING_INKS = ["#8a4414", "#96501a", "#a45c22", "#c8c8d0", "#dcdce2", "#f0f0f6"]


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
    mask = largest_region({(x, y) for y in range(image.height) for x in range(image.width) if test(*px[x, y])})
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
    """A keyed rectangle projects edge to edge, so the terminal's glyphs land on whole art pixels; a painted parallelogram keeps its measured corners."""
    box = box_of(points)
    if len(points) >= box["width"] * box["height"] - RECTANGLE_NOTCH:
        x0, y0, x1, y1 = box["x"], box["y"], box["x"] + box["width"], box["y"] + box["height"]
        return {"topLeft": {"x": x0, "y": y0}, "topRight": {"x": x1, "y": y0}, "bottomLeft": {"x": x0, "y": y1}, "bottomRight": {"x": x1, "y": y1}}
    pick = lambda key: dict(zip("xy", key(points)))
    return {
        "topLeft": pick(lambda p: min(p, key=lambda q: q[0] + q[1])),
        "topRight": pick(lambda p: max(p, key=lambda q: q[0] - q[1])),
        "bottomLeft": pick(lambda p: min(p, key=lambda q: q[0] - q[1])),
        "bottomRight": bottom_right(points),
    }


def mask_image(points, box):
    out = Image.new("RGBA", (box["width"], box["height"]))
    px = out.load()
    for x, y in points:
        px[x - box["x"], y - box["y"]] = (255, 255, 255, 255)
    return out


def luminance(color):
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]


def straight_top(mask):
    """The glass's top edge follows one straight line through the column tops, so the bezel steps evenly instead of jaggedly."""
    tops = {}
    for x, y in mask:
        tops[x] = min(y, tops.get(x, y))
    xs = sorted(tops)
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(tops[x] for x in xs) / n
    slope = sum((x - mean_x) * (tops[x] - mean_y) for x in xs) / (sum((x - mean_x) ** 2 for x in xs) or 1)
    out = set(mask)
    for x in xs:
        line = round(mean_y + slope * (x - mean_x))
        out -= {(x, y) for y in range(tops[x], line)}
        out |= {(x, y) for y in range(line, tops[x])}
    return out


def draw_bezel(scene, masks):
    """A dark frame where the keyed glass meets a light pixel, so every screen has a closed outline."""
    px = scene.load()
    for mask in masks:
        for x, y in mask:
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n not in mask and 0 <= n[0] < scene.width and 0 <= n[1] < scene.height and luminance(px[n]) > BEZEL_MIN_LIGHT:
                    px[n] = BEZEL


def is_log(color):
    r, g, b = color
    return r > LOG_MIN_RED and r - b > LOG_WARMTH


def log_tops(plate, spec):
    """Where each column's logs begin, so flames end behind them and never over them."""
    x0, y0, x1, y1 = spec["fire"]
    px = plate.load()
    tops = {}
    for x in range(x0, x1):
        rows = [y for y in range(spec["logTop"], spec["railTop"]) if is_log(px[x, y])]
        tops[x] = rows[0] if rows else spec["railTop"]
    return tops


def is_flame(color):
    r, g, b = color
    return r > 150 and g > 60 and r - b > 100


def fade_into_embers(out, left, plate, x0, y0, width, height, rail_top):
    """Soften the flat base baked into the tall frames, over dark wall only."""
    px = plate.load()
    for x in range(width):
        column = [y for y in range(height) if out[left + x, y][3] and is_flame(out[left + x, y][:3])]
        if not column:
            continue
        for depth, color in enumerate(EMBER_FADE):
            y = max(column) + 1 + depth
            if y + y0 >= rail_top or y >= height or sum(px[x + x0, y + y0]) > WALL_MAX_LIGHT or out[left + x, y][3]:
                break
            out[left + x, y] = color + (255,)


def fire_strip(art, name, plate, spec):
    """PixelLab's looped fire between the opening's jambs and above the logs, so only the flames move."""
    x0, y0, x1, y1 = spec["fire"]
    left, right = spec["opening"]
    top = log_tops(plate, spec)
    frames = [Image.open(art / "pixellab" / f"fire-{name}-{spec['fireSeed']}-{i}.png").convert("RGB") for i in range(FIRE_FRAMES)]
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * FIRE_FRAMES, height))
    out = strip.load()
    for index, frame in enumerate(frames):
        raw = frame.load()
        for y in range(height):
            for x in range(width):
                if not left <= x + x0 < right or y + y0 >= top[x + x0]:
                    continue
                if is_flame(raw[x, y]):
                    out[index * width + x, y] = raw[x, y] + (255,)
        if spec.get("emberFade"):
            fade_into_embers(out, index * width, plate, x0, y0, width, height, spec["railTop"])
    return strip


def typing_strip(art, name, spec):
    """PixelLab fingers only: pixels outside the hand, or unchanged, stay on the plate."""
    x0, y0, x1, y1 = spec["hands"]
    hx0, hy0, hx1, hy1 = spec["handArea"]
    width, height = x1 - x0, y1 - y0
    load = lambda i: Image.open(art / "pixellab" / f"type-{name}-{spec['typeSeed']}-{i}.png").convert("RGB")
    first = load(0).load()
    strip = Image.new("RGBA", (width * len(TYPE_POSES), height))
    out = strip.load()
    for index, pose in enumerate(TYPE_POSES):
        frame = load(pose).load()
        for y in range(hy0, hy1):
            for x in range(hx0, hx1):
                if sum(abs(a - b) for a, b in zip(frame[x, y], first[x, y])) > HAND_CHANGE:
                    out[index * width + x, y] = skin_toned(frame[x, y]) + (255,)
    return strip


def skin_toned(color):
    """Red shading lines on the fingers take the skin's own hue, so the hand has no red stripes."""
    hue, saturation, value = hsv(color)
    if hue < RED_HUE and saturation >= RED_MIN_SATURATION:
        return from_hsv(SKIN_HUE, saturation * 0.8, value)
    return color


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


def is_jacket(color):
    hue, saturation, value = hsv(color)
    return JACKET_HUE[0] <= hue <= JACKET_HUE[1] and JACKET_SATURATION[0] <= saturation <= JACKET_SATURATION[1] and JACKET_VALUE[0] <= value <= JACKET_VALUE[1]


def jacket_mask(plate, box):
    """The one connected camel region in the shift box: Dan's jacket, shoulders to upper arm."""
    x0, y0, x1, y1 = box
    px = plate.load()
    return largest_region({(x, y) for y in range(y0, y1) for x in range(x0, x1) if is_jacket(px[x, y])})


def shift_strip(plate, spec):
    """Dan's shoulders rise one pixel: frame 0 is rest, frame 1 lifts the jacket pixels inside the box."""
    x0, y0, x1, y1 = spec["shift"]
    px = plate.load()
    jacket = jacket_mask(plate, spec["shift"])
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * SHIFT_FRAMES, height))
    out = strip.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y + 1) in jacket:
                out[width + x - x0, y - y0] = px[x, y + 1] + (255,)
            elif (x, y) in jacket:
                out[width + x - x0, y - y0] = px[x, y] + (255,)
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


def sparkles(plate, window, star_light, city_box):
    x0, y0, x1, y1 = window
    px = plate.load()
    sky_end = int(y0 + (y1 - y0) * 0.45)
    stars = [
        (x, y)
        for y in range(y0 + 3, sky_end)
        for x in range(x0 + 3, x1 - 3)
        if min(px[x, y][:2]) > star_light and px[x, y][2] > star_light - 25 and night_around(px, x, y)
    ]
    cx0, cy0, cx1, cy1 = city_box
    city = [
        (x, y)
        for y in range(cy0, cy1)
        for x in range(cx0, cx1)
        if px[x, y][0] > 170 and px[x, y][1] > 105 and px[x, y][2] < 140 and night_around(px, x, y)
    ]
    return spaced(stars, STAR_GAP), spaced(city, LIGHT_GAP)


def is_water(color):
    r, g, b = color
    return r < 40 and 25 < g < 100 and b > 100 and b > g * 1.6


def lake_spans(plate, box):
    """The open water between the tree lines: the snowy firs share the lake's blues, so the lake is the one connected body inside its box."""
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


def hsv(color):
    r, g, b = (c / 255 for c in color)
    high, low = max(r, g, b), min(r, g, b)
    span = high - low
    if span == 0:
        hue = 0.0
    elif high == r:
        hue = (60 * ((g - b) / span) + 360) % 360
    elif high == g:
        hue = 60 * ((b - r) / span) + 120
    else:
        hue = 60 * ((r - g) / span) + 240
    return hue, span / high if high else 0.0, high


def from_hsv(hue, saturation, value):
    c = value * saturation
    x = c * (1 - abs((hue / 60) % 2 - 1))
    m = value - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(hue // 60) % 6]
    return tuple(round((v + m) * 255) for v in (r, g, b))


def is_shirt(color):
    _, saturation, value = hsv(color)
    return saturation <= SHIRT_MAX_SATURATION and value >= SHIRT_MIN_VALUE


def mean_color(colors):
    return tuple(sum(c[i] for c in colors) / len(colors) for i in range(3))


def trim_jacket(face):
    """The head keeps its face, neck and shirt; its own jacket goes, so the body's jacket runs up to the collar in one drawing."""
    px = face.load()
    for x0, x1, y0, y1 in HEAD_TRIM:
        for y in range(y0, min(y1, face.height)):
            for x in range(x0, min(x1, face.width)):
                if px[x, y][3] and not is_shirt(px[x, y][:3]):
                    px[x, y] = (0, 0, 0, 0)


def soften_chin(face):
    """The near-black stroke under the beard takes the beard's own dark brown, so no line hangs off the jaw."""
    px = face.load()
    beard = [px[x, y][:3] for y in range(*BEARD_ROWS) for x in range(face.width) if px[x, y][3] and BEARD_LIGHT[0] <= luminance(px[x, y]) <= BEARD_LIGHT[1]]
    tone = tuple(round(c) for c in mean_color(beard))
    for y in range(*CHIN_ROWS):
        for x in range(face.width):
            if px[x, y][3] and luminance(px[x, y]) < CHIN_MAX_LIGHT:
                px[x, y] = tone + (255,)


def load_face(art, spec):
    face_file, _ = spec["face"]
    face = Image.open(art / "pixellab" / face_file).convert("RGBA")
    for point, color in HAZEL:
        face.putpixel(point, ImageColor.getrgb(color) + (255,))
    soften_chin(face)
    trim_jacket(face)
    return face


def distance(a, b):
    return sum(abs(p - q) for p, q in zip(a, b))


def is_head(color):
    """Hair, headphone or skin: what the painting's own head is made of."""
    hue, saturation, value = hsv(color)
    hair = value < 0.4 and saturation > 0.25 and (hue <= 45 or hue >= 340)
    black = value < 0.22
    skin = 8 <= hue <= 36 and 0.3 <= saturation <= 0.8 and value > 0.55
    return hair or black or skin


def clear_halo(scene, face, at):
    """The painting's own head is a pixel or two bigger than the approved one. In a thin ring around the sprite, a
    head-coloured pixel that looks like the sprite's edge beside it, and not like the room a few pixels further
    out on its own row (or column, at the top), is that head showing, and it takes the room's colour from there."""
    alpha = face.getchannel("A").load()
    fp = face.load()
    fx, fy = at
    covered = {(fx + x, fy + y): fp[x, y][:3] for x in range(face.width) for y in range(face.height) if alpha[x, y]}
    cx = sum(x for x, _ in covered) / len(covered)
    cy = sum(y for _, y in covered) / len(covered)
    px = scene.load()
    ring = {(x + dx, y + dy) for x, y in covered for dx in range(-HALO_REACH, HALO_REACH + 1) for dy in range(-HALO_REACH, HALO_REACH + 1)} - set(covered)
    inside = lambda p: 0 <= p[0] < scene.width and 0 <= p[1] < scene.height
    cleaned = 0
    for x, y in sorted(ring, key=lambda p: -math.hypot(p[0] - cx, p[1] - cy)):
        if not inside((x, y)) or not is_head(px[x, y]):
            continue
        edge = min(covered, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)
        sideways = (x + HALO_REFERENCE * (1 if x >= cx else -1), y)
        upward = (x, y + HALO_REFERENCE * (1 if y >= cy else -1))
        references = [r for r in (sideways, upward) if inside(r) and r not in ring and r not in covered and not is_head(px[r])]
        if not references:
            continue
        reference = references[0]
        if distance(px[x, y], covered[edge]) < HALO_LIKENESS * distance(px[x, y], px[reference]):
            px[x, y] = px[reference]
            cleaned += 1
    return cleaned


def place_face(scene, art, spec):
    face = load_face(art, spec)
    cleaned = clear_halo(scene, face, spec["face"][1])
    scene.paste(face.convert("RGB"), spec["face"][1], face.getchannel("A"))
    return cleaned


def place_tools(plate, art, tools):
    """Tools go on after the palette step, so their hard edges stay crisp."""
    for candidate, at in tools:
        sprite = Image.open(art / "pixellab" / "pro" / f"tools-{candidate}.png").convert("RGBA")
        sprite = sprite.crop(sprite.getbbox())
        alpha = sprite.getchannel("A")
        shadow = Image.new("RGB", sprite.size, TOOL_SHADOW)
        plate.paste(shadow, (at[0] + 1, at[1] + 2), alpha.point(lambda a: 150 if a else 0))
        warm = Image.blend(sprite.convert("RGB"), Image.new("RGB", sprite.size, FIRELIGHT), FIRELIGHT_MIX)
        plate.paste(warm, at, alpha)


def inked(rows):
    sprite = Image.new("RGBA", (len(rows[0]), len(rows)))
    px = sprite.load()
    for y, row in enumerate(rows):
        for x, ink in enumerate(row):
            if ink != ".":
                px[x, y] = ImageColor.getrgb(INK[ink]) + (255,)
    return sprite


def key_row(field, row, key_rows):
    """One row of caps, three pixels wide with a dark gap, staggered like a real board; the nearest row holds the mods and the space bar."""
    cells = field // KEY_CELL
    shift = (key_rows - 1 - row) % 3
    last = row == key_rows - 1
    accents = {}
    if last:
        accents.update({0: "D", 1: "D", 2: "D", 3: "l", 4: "s", cells - 3: "l", cells - 2: "s", cells - 1: "c"})
    elif row == key_rows - 2:
        accents.update({cells - 1: "y", 0: "m"})
    elif row == 0:
        accents.update({cells - 1: "y"})
    top = bottom = ""
    for column in range(field):
        index, phase = divmod(column + shift, KEY_CELL)
        space = last and 5 <= index <= cells - 4
        if phase == KEY_CELL - 1 and not space:
            top += "g"
            bottom += "g"
            continue
        ink = "K" if space else accents.get(index, "K")
        top += ink
        bottom += "k" if ink == "K" else ink
    return "WP" + top + "PW", "WP" + bottom + "PW"


def keyboard_sprite(width, key_rows):
    """Mode Encore: walnut case with its front lip showing, black plate, small off-white caps with coloured mods, then a separate walnut rest with a maple pinstripe."""
    field = width - 4
    rows = ["W" * width, "W" + "P" * (width - 2) + "W"]
    for row in range(key_rows):
        rows.extend(key_row(field, row, key_rows))
    rows += ["W" + "P" * (width - 2) + "W", "W" * width, "w" * width, "." * width, "M" * width, "w" * width, "W" * width]
    return inked(rows)


def is_skin(color):
    """Skin under the fire's light; the painted keys beside it are lighter and much less saturated."""
    hue, saturation, value = hsv(color)
    return 8 <= hue <= 36 and 0.52 <= saturation <= 0.8 and value >= 0.6


def hand_pixels(plate, box):
    """The painted hand over the keyboard: its skin, grown a pixel to keep its outline."""
    x0, y0, x1, y1 = box
    px = plate.load()
    skin = largest_region({(x, y) for y in range(y0, y1) for x in range(x0, x1) if is_skin(px[x, y])})
    return {(x + dx, y + dy) for x, y in skin for dx in (-1, 0, 1) for dy in (-1, 0, 1)}


def place_keyboard(plate, scene, spec):
    """The keyboard sprite goes under the painted hand: the hand, found in the scene before the palette step, comes back on top of it."""
    x, y, width, key_rows = spec["keyboard"]
    before = plate.copy().load()
    hand = hand_pixels(scene, spec["handGuard"])
    sprite = keyboard_sprite(width, key_rows)
    plate.paste(sprite, (x, y), sprite)
    px = plate.load()
    for hx, hy in hand:
        px[hx, hy] = before[hx, hy]


def place_stack(plate, spec):
    """Schiit Magni, small and black, on a CalDigit dock, long and silver, where the painting's stack is a warm grey box."""
    if "stack" not in spec:
        return
    dx, dy, dw, dh = spec["stack"]["dock"]
    dock = ["L" * dw] + ["S" + "T" * (dw - 2) + "S"] * (dh - 2) + ["D" * dw]
    dock[1] = "S" + "T" * (dw - 7) + "pp" + "T" + "pp" + "S"
    plate.paste(inked(dock), (dx, dy), inked(dock))
    mx, my, mw, mh = spec["stack"]["magni"]
    magni = ["b" * mw] + ["B" * (mw - 1) + "b"] * (mh - 2) + ["B" * mw]
    magni[mh // 2] = "B" * (mw - 4) + "h" + "L" + "Bb"
    plate.paste(inked(magni), (mx, my), inked(magni))


def grade_dock(plate, spec):
    """The painted dock is silver lit by the fire; it goes neutral grey so it reads as the CalDigit under the room's own glow."""
    if "dock" not in spec:
        return
    x0, y0, width, height = spec["dock"]
    px = plate.load()
    for y in range(y0, y0 + height):
        for x in range(x0, x0 + width):
            hue, saturation, value = hsv(px[x, y])
            px[x, y] = from_hsv(hue, 0.0, value)


def is_mauve(color):
    r, g, b = color
    return r > 90 and b >= 0.8 * g and r - b < 90


def warm_firebox(plate, spec):
    """Brick and bark shadows the painting left blue-grey inside the opening lose that blue, so nothing in the firebox reads as mauve beside the flames."""
    x0, y0, x1, _ = spec["fire"]
    px = plate.load()
    for y in range(y0, spec["railTop"]):
        for x in range(x0, x1):
            if is_mauve(px[x, y]):
                r, g, b = px[x, y]
                px[x, y] = (r, g, min(b, int(g * MAUVE_BLUE) - 1))


def is_orange(color):
    hue, saturation, value = hsv(color)
    return 5 <= hue <= 45 and saturation >= 0.5 and value >= 0.5


def place_socks(plate, spec):
    """Dan's bare ankles between the rolled hems and the sneakers wear white socks."""
    px = plate.load()
    for x0, y0, width, height in spec["socks"]:
        for y in range(y0, y0 + height):
            for x in range(x0, x0 + width):
                if is_orange(px[x, y]):
                    px[x, y] = SOCK


def place_strings(plate, spec):
    """Six strings from the nut to the bridge: they fan out down the neck, then run straight over the top to the bridge. Three copper, three silver, one pixel each, half-strength over the dark fretboard so the neck does not turn into a pale comb."""
    top_x, top_y, top_gap = spec["strings"]["top"]
    bottom_x, bottom_y, bottom_gap = spec["strings"]["bottom"]
    px = plate.load()
    for index, ink in enumerate(STRING_INKS):
        color = ImageColor.getrgb(ink)
        start, end = top_x + index * top_gap, bottom_x + index * bottom_gap
        for y in range(top_y, spec["strings"]["bridge"] + 1):
            t = min(1.0, (y - top_y) / (bottom_y - top_y))
            x = round(start + (end - start) * t)
            if y < bottom_y:
                px[x, y] = tuple((c + p) // 2 for c, p in zip(color, px[x, y]))
            else:
                px[x, y] = color


def build(art, out, name, spec):
    size = spec["size"]
    scene = sampled(art / spec["source"], size)
    keyed_magenta = key_mask(scene, lambda r, g, b: r > 170 and b > 170 and g < 90)
    keyed_cyan = key_mask(scene, lambda r, g, b: g > 170 and b > 170 and r < 90)
    magenta, cyan = straight_top(keyed_magenta), straight_top(keyed_cyan)
    main, side = box_of(magenta), box_of(cyan)

    px = scene.load()
    for x, y in (keyed_magenta | keyed_cyan) - (magenta | cyan):
        px[x, y] = BEZEL
    for x, y in magenta | cyan:
        px[x, y] = (30, 30, 46)
    draw_bezel(scene, (magenta, cyan))
    halo = place_face(scene, art, spec)
    plate = scene.quantize(colors=PALETTE_COLORS, dither=Image.Dither.NONE).convert("RGB")
    place_keyboard(plate, scene, spec)
    place_stack(plate, spec)
    grade_dock(plate, spec)
    place_socks(plate, spec)
    place_strings(plate, spec)
    warm_firebox(plate, spec)
    place_tools(plate, art, spec["tools"])

    fire_strip(art, name, plate, spec).save(out / f"room-{name}-fire.png", optimize=True)
    typing_strip(art, name, spec).save(out / f"room-{name}-hands.png", optimize=True)
    sleeping_strip(plate, spec).save(out / f"room-{name}-mishka.png", optimize=True)
    shift_strip(plate, spec).save(out / f"room-{name}-shift.png", optimize=True)
    mask_image(magenta, main).save(out / f"room-{name}-screen.png", optimize=True)
    mask_image(cyan, side).save(out / f"room-{name}-side.png", optimize=True)
    plate.save(out / f"interior{'' if name == 'wide' else '-tall'}.png", optimize=True)

    stars, city = sparkles(scene, spec["window"], spec["starLight"], spec["city"])
    box = lambda b: {"x": b[0], "y": b[1], "width": b[2] - b[0], "height": b[3] - b[1]}
    point = lambda p: {"x": p[0], "y": p[1]}
    print(name, "halo pixels cleaned", halo)
    return {
        "width": size[0], "height": size[1], "main": main, "side": side,
        "mainCorners": corners(magenta), "sideCorners": corners(cyan),
        "fireBox": box(spec["fire"]), "fireFrames": FIRE_FRAMES,
        "handsBox": box(spec["hands"]), "handFrames": len(TYPE_POSES),
        "mishkaBox": box(spec["dog"]), "mishkaFrames": SLEEP_FRAMES, "stars": stars, "city": city, "lake": lake_spans(scene, spec["lake"]),
        "shiftBox": box(spec["shift"]), "shiftFrames": SHIFT_FRAMES,
        "coffee": point(spec["coffee"]), "snore": point(spec["snore"]), "snoreDrift": spec["snoreDrift"], "candles": [point(c) for c in spec["candles"]],
        "blink": {**BLINK, "x": spec["face"][1][0] + BLINK["x"], "y": spec["face"][1][1] + BLINK["y"]},
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
