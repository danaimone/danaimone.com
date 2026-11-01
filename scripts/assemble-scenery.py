#!/usr/bin/env python3
"""Assemble the plant, tree, and skyline sheets from PixelLab candidates.

    assemble-scenery.py pixellab_dir public/game
"""
import colorsys
import math
import sys
from random import Random
from pathlib import Path

from PIL import Image, ImageDraw

PROP = (64, 48)
TREE = (112, 170)
PLANTS = [
    ("steppe", (0, 1, 4, 6, 8, 10, 12, 15)),
    ("seattle", (0, 1, 5, 6, 8, 11, 12, 14)),
    ("alpine", (0, 1, 2, 3, 4, 6, 7, 14)),
]
OLD_PROPS = (2, 4)
OLD_PROP_SIZE = (69, 40)
OLD_TREE_WIDTH = 110
OLD_TREES = 6
SPECIES = [("cottonwood", (0, 3)), ("madrone", (1, 3)), ("cedar", (1, 3)), ("hemlock", (1, 2))]
SKYLINES = ("rattlesnake",)
RANGES = {"olympics": ("olympics2", (28, 0, 609, 160)), "issaquah": ("issaquah2", (0, 0, 640, 168))}
RANGE_ENDS = {"olympics": (("end-oly-r", "right"),), "issaquah": (("end-issa-l", "left"), ("end-issa-r", "right"))}
RAINIER_FLANK = 100
RAINIER_SUMMIT_AT = (272, 0)
RANGE_HAZE = (150, 178, 214)
RANGE_HAZE_MIX = 0.34
CHEWY_RIGHT_EDGE = 479
CHEWY_LEFT_EDGE = 26
CHEWY_ROOF_ROW = 66
CHEWY_BLUE = (28, 73, 194)
BONE_CREAM = (247, 244, 240)
BONE_CENTRE = (207, 68)
BONE_DISC_RADIUS = 10
PNNL_BUILDING = (17, 0, 452, 200)
PNNL_GROUND = (143, 200, 81)
PNNL_SIZE = (510, 224)
PNNL_ENTRANCE_COLUMNS = (190, 262)
PNNL_DOOR_HEAD = (159, 165)
PNNL_RAISED_HEAD = 144
PNNL_DOOR_GLASS_ROW = 170
PNNL_DOOR_CLEAN_UNTIL = 168
PNNL_SIGN_X = 404
PNNL_SIGN_WIDTH = 88
PNNL_SIGN_HEIGHT = 66
PNNL_SIGN_DEPTH = 4
PNNL_SIGN_ARCH = 6
PNNL_SIGN_PLINTH = 7
PNNL_WEDGE = 40
PNNL_FLAG_WIDTH = 11
PNNL_OUTLINE = (20, 15, 16, 255)
PNNL_FACE = (251, 250, 246, 255)
PNNL_SIGN_SIDE = (150, 74, 34, 255)
PNNL_ORANGE = (247, 162, 54, 255)
PNNL_ORANGE_DARK = (214, 82, 30, 255)
PNNL_INK = (66, 68, 76, 255)
PNNL_CONCRETE = (150, 150, 152, 255)
PNNL_CONCRETE_LIGHT = (190, 188, 182, 255)
PNNL_ROCK = (92, 76, 68, 255)
PNNL_ROCK_LIT = (136, 112, 92, 255)
PNNL_POLE = (206, 208, 212, 255)
PNNL_POLE_SHADE = (120, 122, 130, 255)
PNNL_GOLD = (232, 170, 60, 255)
PNNL_NAVY = (36, 52, 104, 255)
PNNL_WHITE = (238, 238, 232, 255)
PNNL_RED = (176, 44, 52, 255)
PNNL_GREEN = (34, 92, 66, 255)
PNNL_LETTERS = (
    ("####", "#..#", "#..#", "####", "#...", "#...", "#..."),
    ("#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"),
    ("#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"),
    ("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
)
TOWER_FLOORS = (46, 60, 75, 90, 105, 119, 134, 149, 163, 178, 193)
TOWER_TOP_PANE = 33
TOWER_FACE_ENDS = 199
TOWER_CANOPY = {"slab": ((7, 71), (199, 201)), "lit": ((17, 60), (199, 201)), "soffit": ((7, 71), (202, 203)), "shadow": ((6, 72), (204, 205))}
CANOPY_GREY = (150, 146, 136, 255)
CANOPY_SOFFIT = (104, 104, 110, 255)
TOWER_LOBBY_ROWS = (207, 221)
TOWER_LOBBY_PANES = (((11, 17), (14,)), ((22, 30), (26,)), ((48, 55), (52,)), ((60, 67), (63,)))
TOWER_LOBBY_PILLARS = ((17, 22), (55, 60))
TOWER_DOOR = (30, 48, 208, 39)
TOWER_FACES = (
    ((11, 67), (19, 29, 38, 48, 58)),
    ((2, 6), (3,)),
    ((72, 75), (73,)),
)
TOWER_PILLARS = ((6, 10), (67, 71))
TOWER_WING = ((81, 140), (88, 97, 106, 115, 123, 132), ((174, 188), (191, 204), (207, 221)))
TOWER_WING_BANDS = ((173, ()), (188, (188, 189)), (204, (204, 205)), (221, (221, 222)))
TOWER_WING_SPAN = (78, 145)
TOWER_WING_PILLARS = ((77, 80), (141, 145))
FRAME_CREAM = (214, 204, 186, 255)
FRAME_LIT = (250, 240, 220, 255)
MULLION = (40, 40, 52, 255)
GLASS_BLUE_MARGIN = 24
ATLASSIAN_SIZE = 40
ATLASSIAN_OVERSAMPLE = 8
ATLASSIAN_VIEWBOX = 24
ATLASSIAN_OUTLINE = (12, 30, 74, 255)
ATLASSIAN_BLUE = (38, 132, 255, 255)
ATLASSIAN_WING_BANDS = ((0, 82, 204, 255), (12, 102, 228, 255), (26, 120, 244, 255), (38, 132, 255, 255))
ATLASSIAN_WING = ((7.12, 11.08), (5.96, 11.21), (0.08, 22.97), (0.71, 23.99), (8.9, 23.99), (9.53, 23.6))
ATLASSIAN_WING_RETURN = ((9.53, 23.6), (11.3, 19.95), (10.22, 14.4), (7.12, 11.08))
ATLASSIAN_PEAK = ((10.53, 15.7), (14.48, 23.6), (15.11, 23.99), (23.3, 23.99), (23.93, 22.97), (12.63, 0.38), (11.43, 0.39))
ATLASSIAN_PEAK_ARC = ((11.43, 0.39), (6.8, 8.0), (10.53, 15.7))
TOWER_ROOF_CLEAR = (13, 8, 53, 26)
TOWER_ROOF_ROW = 26
TOWER_SIGN_FRAME = (16, 42)
TOWER_SIGN_RISE = 3
STEEL = (44, 42, 52, 255)
STEEL_LIT = (92, 90, 104, 255)
VANNEVAR_MARK_AT = (168, 61)
VANNEVAR_MARK_SIZE = 20
VANNEVAR_STRAY_LIGHTS = ((176, 0, 238, 132), (60, 70, 150, 92), (33, 108, 36, 116))
CABIN_STRAY_LIGHTS = (186, 66, 197, 80)
VANNEVAR_GREEN = (212, 242, 90, 255)
WALL_SHADOW = (24, 24, 30, 255)
SKY_SPECK_MIN = 225
CLOUD_KINDS = 6
RIDGE_WIDTH = 640
RIDGE_FOOT = 74
RIDGE_CREST = 11
RIDGE_PEAK_AT = 0.71
RIDGE_FOLD = 48
RIDGE_SWELLS = ((61, 3.4, 0.4), (23, 4.2, 2.1), (9.5, 2.0, 4.2), (4.3, 0.9, 1.0))
RIDGE_PEAK_SHARPNESS = 3.4
GREENING_HUE = 0.2
HILL_REMAP_ROWS = 34
HILL_FIR_SEED = 12
HILL_FIR_TRIES = 170
HILL_FIR_SHADES = ((30, 74, 50, 255), (22, 58, 42, 255), (15, 46, 36, 255))
HILL_TILES = {
    "foothills": "dry-to-lush/lush-e41",
    "foothills-dry": "dry-to-lush/dry-e11",
    "meadow-dry": "dry-to-lush/scrub-e31",
    "meadow-turn": "dry-to-lush/scrub-turn-55",
}


def hazed(sprite):
    r, g, b, alpha = sprite.split()
    faded = Image.blend(Image.merge("RGB", (r, g, b)), Image.new("RGB", sprite.size, RANGE_HAZE), RANGE_HAZE_MIX).convert("RGBA")
    faded.putalpha(alpha)
    return faded


def bone_logo(px):
    cx, cy = BONE_CENTRE
    reach = BONE_DISC_RADIUS + 2
    for y in range(cy - reach, cy + reach + 1):
        for x in range(cx - reach, cx + reach + 1):
            dx, dy = x - cx, y - cy
            distance = math.hypot(dx, dy)
            in_ring = 3.4 <= distance <= 7.2
            in_mouth = dx > 0 and abs(dy) < dx * 0.75
            if distance > BONE_DISC_RADIUS + 0.2:
                px[x, y] = BONE_CREAM + (255,)
            else:
                px[x, y] = (255, 255, 255, 255) if in_ring and not in_mouth else CHEWY_BLUE + (255,)


def chewy_home(sprite):
    px = sprite.load()
    bone_logo(px)
    clear = (0, 0, 0, 0)
    for y in range(sprite.height):
        for x in range(sprite.width):
            behind_roof = x < CHEWY_LEFT_EDGE + 24 and y < CHEWY_ROOF_ROW
            if x >= CHEWY_RIGHT_EDGE or x < CHEWY_LEFT_EDGE or behind_roof:
                px[x, y] = clear
    return sprite.crop(sprite.getbbox())


def line(px, start, end, color):
    (x0, y0), (x1, y1) = start, end
    steps = max(abs(x1 - x0), abs(y1 - y0))
    for step in range(steps + 1):
        px[round(x0 + (x1 - x0) * step / steps), round(y0 + (y1 - y0) * step / steps)] = color


def taller_ground_floor(building):
    top, foot, rows = PNNL_GROUND
    out = Image.new("RGBA", (building.width, top + rows))
    out.paste(building.crop((0, 0, building.width, top)), (0, 0))
    source = building.load()
    target = out.load()
    for y in range(rows):
        row = top + y * (foot - top) // rows
        for x in range(building.width):
            target[x, top + y] = source[x, row]
    return out


def taller_entrance(sprite):
    first, last = PNNL_ENTRANCE_COLUMNS
    head_from, head_to = PNNL_DOOR_HEAD
    source = sprite.copy().load()
    px = sprite.load()
    for x in range(first, last):
        for y in range(head_to - head_from):
            px[x, PNNL_RAISED_HEAD + y] = source[x, head_from + y]
        for y in range(PNNL_RAISED_HEAD + head_to - head_from, PNNL_DOOR_CLEAN_UNTIL):
            px[x, y] = source[x, PNNL_DOOR_GLASS_ROW]
    return sprite


def flag(px, x, top, length, stripes):
    for dx in range(1, PNNL_FLAG_WIDTH + 1):
        wave = math.sin(dx * 0.95)
        fold = 1 - 0.22 * max(0, -wave)
        for dy in range(length - dx // 3):
            r, g, b, a = stripes(dx, dy)
            px[x + dx, top + dy + round(wave * 1.4)] = (round(r * fold), round(g * fold), round(b * fold), a)


def us_flag(dx, dy):
    if dy < 11 and dx < 7:
        return PNNL_NAVY if (dx + dy) % 3 else PNNL_WHITE
    return PNNL_RED if dy // 3 % 2 == 0 else PNNL_WHITE


PNNL_FLAGS = (
    (342, 16, lambda dx, dy: PNNL_NAVY),
    (362, 12, lambda dx, dy: PNNL_WHITE),
    (382, 4, us_flag),
    (402, 14, lambda dx, dy: PNNL_GREEN),
)


def flagpoles(px, ground):
    for x, top, stripes in PNNL_FLAGS:
        for y in range(top, ground):
            px[x, y] = PNNL_POLE
            px[x + 1, y] = PNNL_POLE_SHADE
        for dy in range(-2, 1):
            for dx in range(-1, 3):
                px[x + dx, top + dy] = PNNL_GOLD
        flag(px, x + 1, top + 2, 26, stripes)


def sign_arch(u):
    return round(PNNL_SIGN_ARCH * ((u - 0.5) * 2) ** 2)


def sign_band(u):
    return PNNL_SIGN_HEIGHT - 16 - 15 * u ** 1.25


def pnnl_mark(px, x, y):
    for offset, color in ((0, PNNL_ORANGE), (2, PNNL_ORANGE_DARK)):
        line(px, (x, y + 3 + offset), (x + 10, y + 13), color)
        line(px, (x + 10, y + 13), (x + 30, y + offset // 2), color)
    for rung in range(3, 20, 4):
        line(px, (x + 2 + rung // 2, y + 5 + rung // 2), (x + 8 + rung, y + 11 - rung // 2), PNNL_ORANGE)
    line(px, (x + 22, y + 6), (x + 30, y), PNNL_ORANGE)


def pnnl_wordmark(px, x, y):
    for letter in PNNL_LETTERS:
        for row, bits in enumerate(letter):
            for column, bit in enumerate(bits):
                if bit == "#":
                    for dx in range(2):
                        for dy in range(2):
                            px[x + column * 2 + dx, y + row * 2 + dy] = PNNL_INK
        x += len(letter[0]) * 2 + 3


def monument_sign(px, x, ground):
    top = ground - PNNL_SIGN_HEIGHT - PNNL_SIGN_PLINTH
    for dy in range(PNNL_SIGN_PLINTH):
        shade = PNNL_CONCRETE_LIGHT if dy == 0 else PNNL_CONCRETE
        left = x - 5 + (0 if dy > 1 else 2)
        for dx in range(PNNL_SIGN_WIDTH + 8 - (0 if dy > 1 else 4)):
            px[left + dx, ground - 1 - dy] = shade
    for dx in range(-1, PNNL_SIGN_WIDTH + 1):
        u = min(1, max(0, dx / (PNNL_SIGN_WIDTH - 1)))
        arch = sign_arch(u)
        for dy in range(arch - 1, PNNL_SIGN_HEIGHT + 1):
            edge = dx in (-1, PNNL_SIGN_WIDTH) or dy in (arch - 1, PNNL_SIGN_HEIGHT)
            if edge:
                color = PNNL_OUTLINE
            elif dx < PNNL_SIGN_DEPTH:
                color = PNNL_SIGN_SIDE
            else:
                band = sign_band((dx - PNNL_SIGN_DEPTH) / (PNNL_SIGN_WIDTH - PNNL_SIGN_DEPTH))
                if dy >= band + 3:
                    color = PNNL_ORANGE_DARK
                elif dy >= band:
                    color = PNNL_ORANGE
                elif dx < PNNL_WEDGE and dy >= band - 5 * (1 - dx / PNNL_WEDGE):
                    color = PNNL_CONCRETE
                else:
                    color = PNNL_FACE
            px[x + dx, top + dy] = color
    pnnl_wordmark(px, x + PNNL_SIGN_DEPTH + 8, top + 23)
    pnnl_mark(px, x + 54, top + 9)


def boulders(px, spots, ground):
    for x, width, height in spots:
        for dx in range(width):
            arc = math.sin((dx + 0.5) / width * math.pi) ** 0.6
            for dy in range(round(arc * height)):
                lit = dx < width * 0.6 and dy > arc * height * 0.45
                px[x + dx, ground - 1 - dy] = PNNL_ROCK_LIT if lit else PNNL_ROCK
            px[x + dx, ground - round(arc * height)] = PNNL_OUTLINE


def pnnl_campus(load):
    building = load("pnnl-campus3-b").crop(PNNL_BUILDING)
    building = taller_entrance(taller_ground_floor(building))
    sprite = Image.new("RGBA", (PNNL_SIZE[0], building.height))
    sprite.paste(building, (0, 0))
    px = sprite.load()
    ground = sprite.height
    flagpoles(px, ground)
    boulders(px, ((PNNL_SIGN_X - 24, 15, 9), (PNNL_SIGN_X + PNNL_SIGN_WIDTH + 2, 10, 6), (10, 16, 10), (28, 10, 6)), ground)
    monument_sign(px, PNNL_SIGN_X, ground)
    return sprite


def rooftop_sign(tower, lights):
    for sprite in (tower, lights):
        sprite.paste((0, 0, 0, 0), TOWER_ROOF_CLEAR)
    px = tower.load()
    x0, x1 = TOWER_SIGN_FRAME
    head = TOWER_ROOF_ROW - TOWER_SIGN_RISE
    for y in range(head, TOWER_ROOF_ROW):
        for x in (x0, x1):
            px[x, y] = STEEL
            px[x + 1, y] = STEEL_LIT
    for offset in range(x1 - x0 + 2):
        px[x0 + offset, head] = STEEL
        px[x0 + offset, head + 1] = STEEL_LIT
    for x in range(x0 - 4, x1 + 6):
        px[x, TOWER_ROOF_ROW - 1] = STEEL
    return tower, lights


def is_glass(color):
    return color[2] > color[0] + GLASS_BLUE_MARGIN


def clean_panes(px, lights, columns, rows, mullions):
    left, right = columns
    for y in range(*rows):
        row = {x: px[x, y] for x in range(left, right) if x not in mullions}
        for x in range(left, right):
            if x in mullions:
                px[x, y] = MULLION
                lights[x, y] = (0, 0, 0, 0)
            elif not is_glass(row[x]):
                fill = next((row[x + d] for reach in range(1, right - left) for d in (-reach, reach) if x + d in row and is_glass(row[x + d])), row[x])
                px[x, y] = fill
                lights[x, y] = (0, 0, 0, 0)


def filled_box(px, lit, box, color):
    (left, right), (top, bottom) = box
    for y in range(top, bottom + 1):
        for x in range(left, right):
            px[x, y] = color
            lit[x, y] = (0, 0, 0, 0)


def clean_lobby(px, lit):
    filled_box(px, lit, TOWER_CANOPY["slab"], CANOPY_GREY)
    filled_box(px, lit, TOWER_CANOPY["lit"], FRAME_LIT)
    filled_box(px, lit, TOWER_CANOPY["soffit"], CANOPY_SOFFIT)
    filled_box(px, lit, TOWER_CANOPY["shadow"], MULLION)
    door_left, door_right, door_top, door_mullion = TOWER_DOOR
    bottom = TOWER_LOBBY_ROWS[1]
    for columns, mullions in TOWER_LOBBY_PANES:
        clean_panes(px, lit, columns, TOWER_LOBBY_ROWS, mullions)
    clean_panes(px, lit, (door_left, door_right), TOWER_LOBBY_ROWS, (door_mullion,))
    for first, last in TOWER_LOBBY_PILLARS:
        for y in range(TOWER_LOBBY_ROWS[0] - 1, bottom + 1):
            px[first, y] = px[last - 1, y] = MULLION
            for x in range(first + 1, last - 1):
                px[x, y] = FRAME_CREAM
    for y in range(door_top, bottom):
        px[door_left, y] = px[door_right - 1, y] = FRAME_LIT
    for x in range(door_left, door_right):
        px[x, door_top] = FRAME_LIT


def clean_glazing(tower, lights):
    px, lit = tower.load(), lights.load()
    tops = (TOWER_TOP_PANE, *(floor + 2 for floor in TOWER_FLOORS))
    ends = (*TOWER_FLOORS, TOWER_FACE_ENDS)
    for columns, mullions in TOWER_FACES:
        for rows in zip(tops, ends):
            clean_panes(px, lit, columns, rows, mullions)
        for floor in TOWER_FLOORS:
            for x in range(*columns):
                px[x, floor] = FRAME_CREAM
                px[x, floor + 1] = MULLION
                lit[x, floor] = lit[x, floor + 1] = (0, 0, 0, 0)
    for first, last in TOWER_PILLARS:
        for y in range(TOWER_TOP_PANE, TOWER_FLOORS[-1] + 2):
            px[first, y] = px[last, y] = MULLION
            for x in range(first + 1, last):
                px[x, y] = FRAME_LIT if x < last - 1 else FRAME_CREAM
    clean_lobby(px, lit)
    columns, mullions, floors = TOWER_WING
    for rows in floors:
        clean_panes(px, lit, columns, rows, mullions)
    left, right = TOWER_WING_SPAN
    for first, last in TOWER_WING_PILLARS:
        for y in range(TOWER_WING_BANDS[0][0], TOWER_WING_BANDS[-1][0]):
            px[first, y] = px[last, y] = MULLION
            for x in range(first + 1, last):
                px[x, y] = FRAME_CREAM
    for shadow, creams in TOWER_WING_BANDS:
        for x in range(left, right):
            for y in creams:
                px[x, y] = FRAME_CREAM
                lit[x, y] = (0, 0, 0, 0)
            for y in (creams[0] - 1, creams[-1] + 1) if creams else (shadow,):
                if y < tower.height:
                    px[x, y] = MULLION
    return tower, lights


def quadratic(start, control, end, steps=12):
    return [
        ((1 - t) ** 2 * start[0] + 2 * t * (1 - t) * control[0] + t ** 2 * end[0], (1 - t) ** 2 * start[1] + 2 * t * (1 - t) * control[1] + t ** 2 * end[1])
        for t in (step / steps for step in range(steps + 1))
    ]


def cubic(p0, p1, p2, p3, steps=12):
    points = []
    for step in range(steps + 1):
        t = step / steps
        u = 1 - t
        points.append(tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)))
    return points


def filled(points, reach, inset):
    size = ATLASSIAN_SIZE * ATLASSIAN_OVERSAMPLE
    fit = (ATLASSIAN_SIZE - inset * 2) * ATLASSIAN_OVERSAMPLE / ATLASSIAN_VIEWBOX
    origin = inset * ATLASSIAN_OVERSAMPLE
    mask = Image.new("L", (size, size))
    draw = ImageDraw.Draw(mask)
    draw.polygon([(origin + x * fit, origin + y * fit) for x, y in points], fill=255)
    return mask.resize((ATLASSIAN_SIZE, ATLASSIAN_SIZE), Image.BOX).point(lambda value: 255 if value > reach else 0)


def atlassian_mark():
    wing = list(ATLASSIAN_WING) + cubic(*ATLASSIAN_WING_RETURN)
    peak = list(ATLASSIAN_PEAK) + quadratic(*ATLASSIAN_PEAK_ARC)
    wing_mask, peak_mask = filled(wing, 120, 1), filled(peak, 120, 1)
    mark = Image.new("RGBA", (ATLASSIAN_SIZE, ATLASSIAN_SIZE))
    px = mark.load()
    wing_px, peak_px = wing_mask.load(), peak_mask.load()
    solid = lambda x, y: 0 <= x < ATLASSIAN_SIZE and 0 <= y < ATLASSIAN_SIZE and (wing_px[x, y] or peak_px[x, y])
    wing_rows = [y for y in range(ATLASSIAN_SIZE) if any(wing_px[x, y] for x in range(ATLASSIAN_SIZE))]
    top, bottom = wing_rows[0], wing_rows[-1]
    bands = ATLASSIAN_WING_BANDS
    for y in range(ATLASSIAN_SIZE):
        for x in range(ATLASSIAN_SIZE):
            if peak_px[x, y]:
                px[x, y] = ATLASSIAN_BLUE
            elif wing_px[x, y]:
                px[x, y] = bands[min(len(bands) - 1, (y - top) * len(bands) // (bottom - top + 1))]
            elif any(solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = ATLASSIAN_OUTLINE
    return mark


def wall_mark(labsnow, lights, logo):
    for stray in VANNEVAR_STRAY_LIGHTS:
        lights.paste((0, 0, 0, 0), stray)
    x, y = VANNEVAR_MARK_AT
    size = VANNEVAR_MARK_SIZE
    alpha = logo.getchannel("A").resize((size, size), Image.LANCZOS)
    mark = alpha.point(lambda value: 255 if value > 110 else 0)
    shadow = Image.new("RGBA", (size, size), WALL_SHADOW)
    labsnow.paste(shadow, (x + 1, y + 1), mark)
    lit = Image.new("RGBA", (size, size), VANNEVAR_GREEN)
    labsnow.paste(lit, (x, y), mark)
    lights.paste(lit, (x, y), mark)
    return labsnow, lights


def cabin_lights(lights):
    lights.paste((0, 0, 0, 0), CABIN_STRAY_LIGHTS)
    return lights


def with_painted_ends(sprite, ends, load):
    for name, side in ends:
        end = load(f"dry-to-lush/{name}")
        sprite.paste(end, (0 if side == "left" else sprite.width - end.width, 0))
    return sprite


def dry_seam_closed(dry, patch):
    half = patch.width // 2
    dry.paste(patch.crop((0, 0, half, patch.height)), (dry.width - half, 0))
    dry.paste(patch.crop((half, 0, patch.width, patch.height)), (0, 0))


def smooth(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


def value_noise(x, y, cell, seed):
    def corner(i, j):
        value = math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
        return value - math.floor(value)

    gx, gy = x / cell, y / cell
    i, j = math.floor(gx), math.floor(gy)
    u, v = smooth(gx - i), smooth(gy - j)
    top = corner(i, j) + (corner(i + 1, j) - corner(i, j)) * u
    low = corner(i, j + 1) + (corner(i + 1, j + 1) - corner(i, j + 1)) * u
    return top + (low - top) * v


def sky_rows(tile):
    px = tile.load()
    return [next((y for y in range(tile.height) if px[x, y][3] > 0), tile.height) for x in range(tile.width)]


def greened(color, amount):
    hue, saturation, value = colorsys.rgb_to_hsv(*(channel / 255 for channel in color[:3]))
    hue += (GREENING_HUE - hue) * amount
    saturation *= 1 - 0.18 * amount
    value *= 1 - 0.2 * amount
    return tuple(round(channel * 255) for channel in colorsys.hsv_to_rgb(hue, saturation, value)) + (255,)


def hill_turn(dry, lush):
    width = lush.width
    dry_px, lush_px = dry.load(), lush.load()
    dry_top, lush_top = sky_rows(dry), sky_rows(lush)
    turn = Image.new("RGBA", (width, dry.height))
    out = turn.load()
    for x in range(width):
        along = x / (width - 1)
        top = round(dry_top[x] + (lush_top[x] - dry_top[x]) * smooth(along))
        reach = HILL_REMAP_ROWS
        for y in range(top, dry.height):
            if y < top + reach:
                shift = 1 - (y - top) / reach
                dry_y = round(y + (dry_top[x] - top) * shift)
                lush_y = round(y + (lush_top[x] - top) * shift)
            else:
                dry_y = lush_y = y
            clumps = value_noise(x, y * 1.7, 26, 1) * 0.5 + value_noise(x, y * 1.7, 9, 2) * 0.3 + value_noise(x, y * 2, 4, 3) * 0.2
            forest = smooth((along - 0.04) / 0.94) + (clumps - 0.5) * 1.9
            pixel = lush_px[x, lush_y] if forest > 0.5 else greened(dry_px[x, dry_y], smooth((along - 0.02) / 0.8))
            out[x, y] = pixel if pixel[3] else lush_px[x, y]
    scattered_firs(turn)
    return turn


def scattered_firs(turn):
    px = turn.load()
    random = Random(HILL_FIR_SEED)
    tops = sky_rows(turn)
    for _ in range(HILL_FIR_TRIES):
        x = random.randrange(8, turn.width - 8)
        along = x / turn.width
        y = random.randrange(tops[x] + 12, turn.height)
        if random.random() > smooth(along / 0.55) or random.random() < smooth((along - 0.6) / 0.3):
            continue
        height = 5 + (y - tops[x]) // 12 + random.randrange(4)
        for row in range(height):
            half = (row + 1) // 3 + (row % 3 == 2)
            for dx in range(-half, half + 1):
                shade = HILL_FIR_SHADES[0 if dx < 0 else 1 if dx == 0 else 2]
                if px[x + dx, y - height + row][3]:
                    px[x + dx, y - height + row] = shade
        if px[x, y][3]:
            px[x, y] = (58, 42, 30, 255)


def largest_part(points):
    remaining = set(points)
    best = set()
    while remaining:
        start = remaining.pop()
        part = {start}
        frontier = [start]
        while frontier:
            x, y = frontier.pop()
            for step in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if step in remaining:
                    remaining.remove(step)
                    part.add(step)
                    frontier.append(step)
        if len(part) > len(best):
            best = part
    return best


def clouds_without_puffs(atlas):
    px = atlas.load()
    width = atlas.width // CLOUD_KINDS
    for kind in range(CLOUD_KINDS):
        frame = {(x, y) for x in range(kind * width, (kind + 1) * width) for y in range(atlas.height) if px[x, y][3] > 0}
        for point in frame - largest_part(frame):
            px[point] = (0, 0, 0, 0)
    return atlas


def ridge_top(x):
    t = x / RIDGE_WIDTH
    rise = RIDGE_FOOT - (RIDGE_FOOT - RIDGE_CREST) * math.sin(min(t / RIDGE_PEAK_AT, 1) * math.pi / 2) ** RIDGE_PEAK_SHARPNESS
    fall = max(0, t - RIDGE_PEAK_AT) / (1 - RIDGE_PEAK_AT)
    profile = rise + (RIDGE_FOOT - RIDGE_CREST) * fall ** 1.5
    return profile + sum(amplitude * math.sin(x / wavelength + phase) for wavelength, amplitude, phase in RIDGE_SWELLS)


def uneven_ridge(sprite):
    px = sprite.load()
    out = sprite.copy()
    target = out.load()
    for x in range(sprite.width):
        rows = [y for y in range(sprite.height) if px[x, y][3] > 0]
        if not rows:
            continue
        top = rows[0]
        new_top = max(2, round(ridge_top(x)))
        fold = top + RIDGE_FOLD
        for y in range(0, fold):
            source = top + (y - new_top) * (fold - top) / (fold - new_top) if y >= new_top else None
            target[x, y] = px[x, min(fold - 1, round(source))] if source is not None else (0, 0, 0, 0)
    return out


def rainier_with_flanks(load):
    base = load("dry-to-lush/rainier-base")
    sprite = Image.new("RGBA", (base.width + RAINIER_FLANK * 2, base.height))
    sprite.paste(base, (RAINIER_FLANK, 0))
    sprite = with_painted_ends(sprite, (("end-rainier-l", "left"), ("end-rainier-r", "right")), load)
    sprite.paste(load("dry-to-lush/rainier-summit"), RAINIER_SUMMIT_AT)
    return sprite


def reachable(start, passable, size):
    width, height = size
    seen = set(start)
    frontier = list(start)
    while frontier:
        x, y = frontier.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            step = (x + dx, y + dy)
            if 0 <= step[0] < width and 0 <= step[1] < height and step not in seen and passable(step):
                seen.add(step)
                frontier.append(step)
    return seen


def solid_terrain(sprite):
    px = sprite.load()
    size = sprite.size
    sky_speck = lambda point: point[1] > 0 and px[point[0], point[1] - 1][3] == 0 and min(px[point][:3]) > SKY_SPECK_MIN
    opaque = lambda point: px[point][3] > 0
    base_row = sprite.height - 2
    base = [(x, base_row) for x in range(sprite.width) if opaque((x, base_row))]
    terrain = reachable(base, lambda point: opaque(point) and not sky_speck(point), size)
    top = [(x, 0) for x in range(sprite.width) if (x, 0) not in terrain]
    sky = reachable(top, lambda point: point not in terrain, size)
    for y in range(sprite.height):
        for x in range(sprite.width):
            if (x, y) in sky:
                px[x, y] = (0, 0, 0, 0)
            elif not opaque((x, y)):
                px[x, y] = px[x, y - 1]
    return sprite


def planted(sprite, size):
    box = sprite.getbbox()
    trimmed = sprite.crop(box)
    frame = Image.new("RGBA", size)
    frame.paste(trimmed, ((size[0] - trimmed.width) // 2, size[1] - trimmed.height), trimmed)
    return frame


def sheet(frames, size):
    out = Image.new("RGBA", (size[0] * len(frames), size[1]))
    for i, frame in enumerate(frames):
        out.paste(frame, (i * size[0], 0))
    return out


def main():
    source, out = Path(sys.argv[1]) / "pro", Path(sys.argv[2])
    load = lambda name: Image.open(source / f"{name}.png").convert("RGBA")
    plants = [planted(load(f"{group}-{i}"), PROP) for group, picks in PLANTS for i in picks]
    old_props = Image.open(Path(sys.argv[1]) / "props-base.png").convert("RGBA")
    width, height = OLD_PROP_SIZE
    plants += [planted(old_props.crop((i * width, 0, (i + 1) * width, height)), PROP) for i in OLD_PROPS]
    sheet(plants, PROP).save(out / "props.png", optimize=True)

    old_trees = Image.open(Path(sys.argv[1]) / "trees-base.png").convert("RGBA")
    trees = [planted(old_trees.crop((i * OLD_TREE_WIDTH, 0, (i + 1) * OLD_TREE_WIDTH, TREE[1])), TREE) for i in range(OLD_TREES)]
    trees += [planted(load(f"{name}-{i}"), TREE) for name, picks in SPECIES for i in picks]
    sheet(trees, TREE).save(out / "trees.png", optimize=True)

    for name in SKYLINES:
        uneven_ridge(load(f"{name}-0")).save(out / f"skyline-{name}.png", optimize=True)
    clouds_without_puffs(load("clouds-base")).save(out / "clouds.png", optimize=True)
    for name, (source_name, box) in RANGES.items():
        with_painted_ends(hazed(load(source_name).crop(box)), RANGE_ENDS[name], load).save(out / f"skyline-{name}.png", optimize=True)
    rainier_with_flanks(load).save(out / "rainier.png", optimize=True)
    tiles = {name: solid_terrain(load(source_name)) for name, source_name in HILL_TILES.items()}
    dry_seam_closed(tiles["foothills-dry"], solid_terrain(load("dry-to-lush/seam-dry-82")))
    tiles["foothills-turn"] = hill_turn(tiles["foothills-dry"], tiles["foothills"])
    for name, tile in tiles.items():
        tile.save(out / f"{name}.png", optimize=True)
    chewy_home(load("chewy-home")).save(out / "chewy.png", optimize=True)
    pnnl_campus(load).save(out / "lab.png", optimize=True)
    taller_entrance(load("lab-lights-base")).save(out / "lab-lights.png", optimize=True)
    tower, tower_lights = clean_glazing(*rooftop_sign(load("tower-base"), load("tower-lights-base")))
    atlassian_mark().save(out / "logos" / "atlassian.png", optimize=True)
    tower.save(out / "tower.png", optimize=True)
    tower_lights.save(out / "tower-lights.png", optimize=True)
    labsnow, labsnow_lights = wall_mark(load("labsnow-base"), load("labsnow-lights-base"), Image.open(out / "logos" / "vannevar.png").convert("RGBA"))
    labsnow.save(out / "labsnow.png", optimize=True)
    labsnow_lights.save(out / "labsnow-lights.png", optimize=True)
    cabin_lights(load("cabin-lights-base")).save(out / "cabin-lights.png", optimize=True)


if __name__ == "__main__":
    main()
