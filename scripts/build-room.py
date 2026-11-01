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
        "size": (853, 480), "source": "master-wide29.png", "paletteSource": "master-wide25b.png",
        "fire": (704, 206, 784, 306), "opening": (704, 784), "fireSeed": 51, "logTop": 262, "railTop": 304, "grateTop": 291,
        "logRim": [(713, 285), (718, 279), (722, 276), (726, 272), (732, 272), (737, 276), (739, 275), (745, 272), (750, 268), (757, 264), (761, 264), (765, 268), (766, 273), (771, 272), (776, 274), (778, 279), (779, 285)],
        "hands": (430, 225, 530, 265), "handArea": (44, 10, 72, 27), "typeSeed": 125,
        "dog": (630, 295, 790, 375), "snore": (710, 327), "snoreDrift": -22,
        "window": (56, 30, 385, 240), "starLight": 145, "city": (60, 198, 340, 211), "lake": (120, 209, 380, 236),
        "inFrontOfWindow": [(277, 182, 293, 245), (272, 184, 299, 202), (258, 238, 312, 300), (314, 176, 366, 208), (328, 205, 354, 228), (307, 224, 376, 240), (85, 226, 256, 262)],
        "face": ("face-hd.png", (421, 149)),
        "coffee": (573, 236), "candles": [(690, 121), (706, 126)],
        "keyboard": {"at": (476, 237), "cells": 13, "shear": 0.3, "capRows": 3, "frontRow": 20, "rest": "CACACF", "clear": [(488, 238, 538, 250), (470, 247, 534, 255)], "desk": [(169, 76, 33), (147, 59, 21)]},
        "handLift": 5,
        "dock": (550, 241, 17, 3),
        "socks": [(467, 318, 9, 4), (482, 321, 11, 4)],
        "strings": {"top": (282, 198, 1.0), "bottom": (279, 262, 2.0), "bridge": 273},
        "tools": [(1, (745, 404)), (0, (690, 420)), (2, (792, 414))],
    },
    "tall": {
        "size": (480, 960), "source": "master-tall31.png", "paletteSource": "master-tall25g.png",
        "fire": (393, 474, 453, 592), "opening": (395, 451), "fireSeed": 52, "logTop": 540, "railTop": 590, "grateTop": 574, "emberFade": True,
        "logRim": [(400, 566), (404, 563), (410, 562), (412, 559), (414, 557), (419, 555), (427, 552), (434, 548), (438, 548), (440, 552), (441, 559), (444, 560), (449, 561), (451, 564)],
        "hands": (170, 480, 270, 520), "handArea": (34, 14, 66, 30), "typeSeed": 126,
        "dog": (230, 615, 430, 720), "snore": (352, 640), "snoreDrift": -14,
        "window": (30, 176, 248, 402), "starLight": 175, "city": (90, 338, 220, 354), "lake": (90, 352, 240, 400),
        "inFrontOfWindow": [(3, 383, 62, 410)],
        "face": ("face-hd.png", (133, 397)),
        "coffee": (300, 507), "candles": [(396, 380), (408, 385)],
        "keyboard": {"at": (208, 499), "cells": 10, "shear": 0.2, "capRows": 3, "frontRow": 19, "rest": "CACACF", "clear": [(220, 500, 258, 513), (203, 511, 259, 524)], "desk": [(185, 77, 15), (151, 55, 13)]},
        "handLift": 3,
        "stack": {"dock": (273, 498, 20, 5), "magni": (276, 493, 13, 5)},
        "socks": [],
        "strings": {"top": (372, 138, 1.3), "bottom": (369, 218, 2.2), "bridge": 231},
        "tools": [],
    },
}
FIRE_FRAMES = 8
FLAME_STRETCH_ROWS = 18
FLAME_SEAT_REACH = 26
LOG_MIN_RED = 140
LOG_WARMTH = 60
TYPE_POSES = (1, 2, 5, 6, 7)
HAND_OUTLINE_MAX_VALUE = 0.3
HAND_SHADING_MIN_VALUE = 0.45
FINGER_LINE_MIN_SATURATION = 0.3
FINGER_LINE_LIGHT = 0.7
SLEEP_FRAMES = 8
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
DESK_GRAIN = 3
SHADOW = "z"
SHADOW_LIGHT = 0.55
KEY_ROWS = (
    {"stagger": 0, "keys": {}},
    {"stagger": 1, "keys": {-2: "m", -1: "k"}},
    {"stagger": 2, "keys": {0: "y", -3: "y", -2: "k", -1: "k"}},
    {"stagger": 0, "keys": {0: "c", 1: "s", 2: "l", -3: "s", -2: "l", -1: "k"}, "space": (3, -3)},
)
RECTANGLE_GAP_SHARE = 0.04
SKIN_HUE = 18
RED_HUE = 14
RED_MIN_SATURATION = 0.5
MAUVE_BLUE = 0.75
SOCK = (236, 232, 226)

INK = {
    "R": "#1a0e08", "C": "#4c2a16", "H": "#8c5634", "F": "#3a1f10", "A": "#a8865c", "P": "#1e1e22", "K": "#ece6da", "k": "#d9d2c4", "g": "#3c3a38",
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
    """A keyed rectangle projects edge to edge, so the terminal's glyphs land on whole art pixels and fill the glass to every
    bezel edge (the mask trims its one-pixel steps); a painted parallelogram keeps its measured corners."""
    box = box_of(points)
    if len(points) >= box["width"] * box["height"] * (1 - RECTANGLE_GAP_SHARE):
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


def log_edges(spec):
    """The logs' top rim per column, traced from the plate; left and right of the logs the flames end on the grate."""
    x0, _, x1, _ = spec["fire"]
    rim = spec["logRim"]
    edges = {}
    for x in range(x0, x1):
        edges[x] = spec["grateTop"]
        for (ax, ay), (bx, by) in zip(rim, rim[1:]):
            if ax <= x <= bx:
                edges[x] = round(ay + (by - ay) * (x - ax) / (bx - ax))
    return edges


def seat_flame(column, last, edge):
    """Stretch the lowest rows of one column's flame so it runs down to the log edge, keeping the flame's own shading."""
    start = max(min(column), last - FLAME_STRETCH_ROWS)
    span = edge - 1 - start
    for y in range(start, edge):
        yield y, column.get(start + round((y - start) * (last - start) / span)) if span else column.get(start)


def is_flame(color):
    r, g, b = color
    return r > 150 and g > 60 and r - b > 100


def fade_into_embers(out, left, plate, x0, y0, width, height, edge):
    """Soften the flat base baked into the tall frames, over dark wall only."""
    px = plate.load()
    for x in range(width):
        column = [y for y in range(height) if out[left + x, y][3] and is_flame(out[left + x, y][:3])]
        if not column:
            continue
        for depth, color in enumerate(EMBER_FADE):
            y = max(column) + 1 + depth
            if y + y0 >= edge[x + x0] or y >= height or sum(px[x + x0, y + y0]) > WALL_MAX_LIGHT or out[left + x, y][3]:
                break
            out[left + x, y] = color + (255,)


def fire_strip(art, name, plate, spec):
    """PixelLab's looped fire between the opening's jambs. Each column's flame ends on the logs' top edge in every frame, so only the flames move and none hangs above the logs."""
    x0, y0, x1, y1 = spec["fire"]
    left, right = spec["opening"]
    top = log_tops(plate, spec)
    edge = log_edges(spec)
    frames = [Image.open(art / "pixellab" / f"fire-{name}-{spec['fireSeed']}-{i}.png").convert("RGB") for i in range(FIRE_FRAMES)]
    width, height = x1 - x0, y1 - y0
    strip = Image.new("RGBA", (width * FIRE_FRAMES, height))
    out = strip.load()
    for index, frame in enumerate(frames):
        raw = frame.load()
        for x in range(width):
            if not left <= x + x0 < right:
                continue
            column = {y + y0: raw[x, y] for y in range(min(height, frame.height)) if y + y0 < min(top[x + x0], edge[x + x0]) and is_flame(raw[x, y])}
            if not column:
                continue
            for y, color in column.items():
                out[index * width + x, y - y0] = color + (255,)
            over_logs = spec["logRim"][0][0] <= x + x0 <= spec["logRim"][-1][0]
            if not over_logs or edge[x + x0] - max(column) > FLAME_SEAT_REACH:
                continue
            for y, color in seat_flame(column, max(column), edge[x + x0]):
                if color:
                    out[index * width + x, y - y0] = color + (255,)
                elif out[index * width + x, y - y0][3] == 0:
                    out[index * width + x, y - y0] = column[max(k for k in column if k <= y)] + (255,)
        if spec.get("emberFade"):
            fade_into_embers(out, index * width, plate, x0, y0, width, height, edge)
    return strip


def type_frame(art, name, spec, pose):
    return Image.open(art / "pixellab" / f"type-{name}-{spec['typeSeed']}-{pose}.png").convert("RGB")


def is_hand_colour(color):
    """Lit skin and the red shading lines on the fingers; the walnut desk around the hand is darker."""
    hue, saturation, value = hsv(color)
    lit_skin = 5 <= hue <= 40 and 0.2 <= saturation <= 0.95 and value >= 0.8
    shading = (hue < RED_HUE or hue > 340) and saturation >= 0.45 and value >= 0.45
    return lit_skin or shading


def hand_silhouette(frame, area):
    """The hand in a PixelLab frame, in hands-box coordinates: its skin, the warm shading enclosed by it, and the dark
    outline along its top. Everything else in the frame, the gaps between the fingers included, is the old keyboard
    and desk it was cut from."""
    px = frame.load()
    x0, y0, x1, y1 = area
    skin = largest_region({(x, y) for y in range(y0, y1) for x in range(x0, x1) if is_hand_colour(px[x, y])})
    inside = lambda p: x0 <= p[0] < x1 and y0 <= p[1] < y1
    outside = deque(p for p in ((x, y) for y in range(y0, y1) for x in range(x0, x1)) if p not in skin and (p[0] in (x0, x1 - 1) or p[1] in (y0, y1 - 1)))
    seen = set(outside)
    while outside:
        x, y = outside.popleft()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if inside(n) and n not in skin and n not in seen:
                seen.add(n)
                outside.append(n)
    shading = lambda p: (hsv(px[p])[0] <= 45 or hsv(px[p])[0] > 340) and hsv(px[p])[2] >= HAND_SHADING_MIN_VALUE
    hand = skin | {(x, y) for y in range(y0, y1) for x in range(x0, x1) if (x, y) not in seen and shading((x, y))}
    outline = {(x, y - 1) for x, y in hand if inside((x, y - 1)) and (x, y - 1) not in hand and hsv(px[x, y - 1])[2] <= HAND_OUTLINE_MAX_VALUE}
    return closed(hand | outline, inside)


def closed(hand, inside):
    """One-pixel gaps between the fingers belong to the hand: in the frames they show the old keyboard, which on the
    new board reads as holes in the fingers."""
    cross = ((1, 0), (-1, 0), (0, 1), (0, -1))
    grown = hand | {(x + dx, y + dy) for x, y in hand for dx, dy in cross if inside((x + dx, y + dy))}
    return hand | {p for p in grown if all((p[0] + dx, p[1] + dy) in grown for dx, dy in cross)}


def lifted_hand(frame, spec):
    """The hand raised so its fingertips rest on the board's back row of caps. The wrist stays where the arm enters the
    hand area and the lift grows toward the fingertips, so the forearm tilts instead of breaking."""
    px = frame.load()
    hand = hand_silhouette(frame, spec["handArea"])
    wrist = spec["handArea"][0]
    reach = max(x for x, _ in hand) - wrist
    lift = lambda x: round(spec["handLift"] * (x - wrist) / reach)
    return {(x, y - lift(x)): finger_toned(px, hand, x, y) for x, y in hand}


def finger_toned(px, hand, x, y):
    """A gap pixel the closing added keeps its own colour when it is warm finger shading; a key colour becomes the
    darkened skin beside it, the line between two fingers."""
    hue, saturation, _ = hsv(px[x, y])
    if (hue <= 45 or hue > 340) and saturation >= FINGER_LINE_MIN_SATURATION:
        return skin_toned(px[x, y])
    skin = [skin_toned(px[n]) for n in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if n in hand and is_hand_colour(px[n])]
    return tuple(round(c * FINGER_LINE_LIGHT) for c in mean_color(skin)) if skin else skin_toned(px[x, y])


def typing_strip(clean, idle_hand, art, name, spec):
    """Each pose's hand over the clean board: where the idle hand on the plate is not covered by the pose, the board
    and desk under it show, so no old keyboard pixels travel with the fingers."""
    x0, y0, x1, y1 = spec["hands"]
    width, height = x1 - x0, y1 - y0
    under = clean.load()
    strip = Image.new("RGBA", (width * len(TYPE_POSES), height))
    out = strip.load()
    for index, pose in enumerate(TYPE_POSES):
        hand = lifted_hand(type_frame(art, name, spec, pose), spec)
        for x, y in idle_hand.keys() - hand.keys():
            out[index * width + x, y] = under[x0 + x, y0 + y] + (255,)
        for (x, y), color in hand.items():
            out[index * width + x, y] = color + (255,)
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


def night_around(px, x, y):
    ring = [px[x + dx, y + dy] for dx in (-3, 3) for dy in (-3, 3)]
    return all(b > r + 12 for r, g, b in ring)


def in_front(spec, x, y):
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in spec["inFrontOfWindow"])


def clear_of_objects(points, spec):
    """Sky animation stays on the glass: nothing twinkles on what stands in front of the window."""
    return [p for p in points if not in_front(spec, *p)]


def lake_clear_of_objects(spans, spec):
    out = []
    for x, y, width in spans:
        run = None
        for column in range(x, x + width + 1):
            free = column < x + width and not in_front(spec, column, y)
            if free and run is None:
                run = column
            elif not free and run is not None:
                if column - run >= MIN_LAKE_SPAN:
                    out.append([run, y, column - run])
                run = None
    return out


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


def key_row(field, cells, row, cap_rows):
    """One row of caps, three pixels wide with a dark gap, staggered like a real board. Accents sit at the row ends as on
    Dan's board (refs/keyboard-dan-up.jpg, seen from his chair): mint second from the right on the home row, yellow at
    both ends of the shift row, coral, sky and lilac left of the space bar and sky and lilac right of it."""
    accents = {(k if k >= 0 else cells + k): ink for k, ink in row["keys"].items()}
    space = row.get("space")
    top = front = ""
    for column in range(field):
        index, phase = divmod(column + row["stagger"], KEY_CELL)
        in_space = space is not None and space[0] <= index < cells + space[1]
        if phase == KEY_CELL - 1 and not (in_space and index < cells + space[1] - 1):
            top += "g"
            front += "g"
            continue
        ink = "K" if in_space else accents.get(index, "K")
        top += ink
        front += "k" if ink == "K" else ink
    return ["CR" + top + "RC"] * (cap_rows - 1) + ["CR" + front + "RC"]


def keyboard_rows(cells, rest, cap_rows):
    """Back to front, as on Dan's board (refs/keyboard-dan-up.jpg): the walnut case's lit back edge, a dark rim around
    four rows of caps set inside it, the case's front face, its shadow on the desk, then the wrist rest in the same
    walnut with two maple pinstripes and its own shadow. Row 0 is the rim; the lit back edge sits one row above it."""
    field = cells * KEY_CELL - 1
    width = field + 4
    rim = "C" + "R" * (width - 2) + "C"
    rows = ["H" * width, rim]
    for row in KEY_ROWS:
        rows.extend(key_row(field, cells, row, cap_rows))
    rows += [rim, "F" * width, SHADOW * width]
    rows += ["." + ink * (width - 2) + "." for ink in rest]
    rows += ["." + SHADOW * (width - 2) + "."]
    return rows


def keyboard_cells(spec):
    """The rows laid on the desk plane: each row further back moves right by the desk's shear, so the board and the rest
    are parallelograms like the desk under them. Rows stay level: a stepped slope splits the board into offset blocks."""
    x0, y0 = spec["at"]
    rows = keyboard_rows(spec["cells"], spec["rest"], spec["capRows"])
    cells = {}
    for i, row in enumerate(rows, start=-1):
        lean = round(spec["shear"] * (spec["frontRow"] - i))
        for u, ink in enumerate(row):
            if ink != ".":
                cells[(x0 + u + lean, y0 + i)] = SHADOW if ink == SHADOW else ImageColor.getrgb(INK[ink])
    return cells


def place_keyboard(plate, art, name, spec):
    """The painted keyboard and hand are cleared and the keyboard drawn in the desk's perspective. Cleared cells left of
    the new board take the desk or leather beside them on their row; cells right of it are walnut desk up to the mouse
    pad; cells the painted hand covered and the board does not take the desk below them. The idle hand, PixelLab's
    first frame (cut from this painting), goes back on top, lifted onto the keys. Returns the plate under the hand and
    the idle hand, which the typing strip needs."""
    board = spec["keyboard"]
    hx, hy = spec["hands"][:2]
    wrist = hx + spec["handArea"][0]
    first = type_frame(art, name, spec, 0)
    painted = {(hx + x + dx, hy + y + dy) for x, y in hand_silhouette(first, spec["handArea"]) for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
    painted = {(x, y) for x, y in painted if x >= wrist}
    before = plate.copy().load()
    cells = keyboard_cells(board)
    clear = {(x, y) for x0, y0, x1, y1 in board["clear"] for y in range(y0, y1) for x in range(x0, x1)}
    px = plate.load()
    right_end = {}
    for x, y in cells:
        right_end[y] = max(x, right_end.get(y, x))
    for x, y in sorted(clear - set(cells) - painted):
        if y in right_end and x > right_end[y]:
            px[x, y] = board["desk"][1 if y % DESK_GRAIN == 0 else 0]
            continue
        source = next(((sx, y) for sx in range(x - 1, x - 60, -1) if (sx, y) not in clear and (sx, y) not in painted), None)
        if source is not None:
            px[x, y] = before[source]
    for point, color in cells.items():
        px[point] = tuple(round(c * SHADOW_LIGHT) for c in px[point]) if color == SHADOW else color
    for x, y in sorted(painted - set(cells), key=lambda p: -p[1]):
        below = next(sy for sy in range(y + 1, plate.height) if (x, sy) not in painted or (x, sy) in cells)
        px[x, y] = px[x, below]
    clean = plate.copy()
    idle_hand = lifted_hand(first, spec)
    for (x, y), color in idle_hand.items():
        px[hx + x, hy + y] = color
    return clean, idle_hand


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


def prepared_scene(path, art, spec):
    """The sampled painting with its screens keyed and Dan's head on, ready for the palette step."""
    scene = sampled(path, spec["size"])
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
    return scene, magenta, cyan, main, side, place_face(scene, art, spec)


def palette_locked(scene, reference):
    """The reference painting sets the palette and its quantized pixels; only pixels the repairs changed map to that palette on their own, so nothing outside a repair moves by one colour step."""
    locked = reference.quantize(colors=PALETTE_COLORS, dither=Image.Dither.NONE)
    plate = locked.convert("RGB")
    repaired = scene.quantize(palette=locked, dither=Image.Dither.NONE).convert("RGB")
    a, b, out, ours = reference.load(), scene.load(), plate.load(), repaired.load()
    for y in range(scene.height):
        for x in range(scene.width):
            if a[x, y] != b[x, y]:
                out[x, y] = ours[x, y]
    return plate


def build(art, out, name, spec):
    size = spec["size"]
    scene, magenta, cyan, main, side, halo = prepared_scene(art / spec["source"], art, spec)
    reference, *_ = prepared_scene(art / spec["paletteSource"], art, spec)
    plate = palette_locked(scene, reference)
    clean, idle_hand = place_keyboard(plate, art, name, spec)
    place_stack(plate, spec)
    grade_dock(plate, spec)
    place_socks(plate, spec)
    place_strings(plate, spec)
    warm_firebox(plate, spec)
    place_tools(plate, art, spec["tools"])

    fire_strip(art, name, plate, spec).save(out / f"room-{name}-fire.png", optimize=True)
    typing_strip(clean, idle_hand, art, name, spec).save(out / f"room-{name}-hands.png", optimize=True)
    sleeping_strip(plate, spec).save(out / f"room-{name}-mishka.png", optimize=True)
    mask_image(magenta, main).save(out / f"room-{name}-screen.png", optimize=True)
    mask_image(cyan, side).save(out / f"room-{name}-side.png", optimize=True)
    plate.save(out / f"interior{'' if name == 'wide' else '-tall'}.png", optimize=True)

    stars, city = [clear_of_objects(points, spec) for points in sparkles(scene, spec["window"], spec["starLight"], spec["city"])]
    box = lambda b: {"x": b[0], "y": b[1], "width": b[2] - b[0], "height": b[3] - b[1]}
    point = lambda p: {"x": p[0], "y": p[1]}
    print(name, "halo pixels cleaned", halo)
    return {
        "width": size[0], "height": size[1], "main": main, "side": side,
        "mainCorners": corners(magenta), "sideCorners": corners(cyan),
        "fireBox": box(spec["fire"]), "fireFrames": FIRE_FRAMES,
        "handsBox": box(spec["hands"]), "handFrames": len(TYPE_POSES),
        "mishkaBox": box(spec["dog"]), "mishkaFrames": SLEEP_FRAMES, "stars": stars, "city": city, "lake": lake_clear_of_objects(lake_spans(scene, spec["lake"]), spec),
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
