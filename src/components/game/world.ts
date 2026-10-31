import { experience, type StopId } from "../../data/resume";
import { WALK_START, progressAt, type Destination } from "./track";

export const WORLD_WIDTH = 4260;
export const BASELINE = 2;
export const PROMOTION_X = 2480;

type Sign = { logo: string; x: number; y: number; size: number; plate: boolean };

export type Landmark = {
  name: string;
  x: number;
  width: number;
  height: number;
  lights: { daylight: number } | null;
  sign: Sign | null;
};

const TRAIL_SIGN: Landmark = { name: "sign", x: 150, width: 63, height: 50, lights: null, sign: null };
const LAB: Landmark = { name: "lab", x: 640, width: 264, height: 112, lights: { daylight: 0.3 }, sign: { logo: "pnnl", x: 186, y: 30, size: 20, plate: true } };
const WAREHOUSE: Landmark = { name: "warehouse", x: 1500, width: 526, height: 150, lights: { daylight: 0 }, sign: { logo: "chewy-sign", x: 287, y: 13, size: 16, plate: false } };
const TOWER: Landmark = { name: "tower", x: 2350, width: 146, height: 224, lights: { daylight: 0 }, sign: { logo: "atlassian", x: 16, y: 2, size: 24, plate: true } };
const LABS_NOW: Landmark = { name: "labsnow", x: 3150, width: 238, height: 132, lights: { daylight: 0.45 }, sign: { logo: "vannevar", x: 158, y: 66, size: 24, plate: true } };
const CABIN: Landmark = { name: "cabin", x: 3950, width: 197, height: 124, lights: { daylight: 0 }, sign: null };

export const LANDMARKS = [TRAIL_SIGN, LAB, WAREHOUSE, TOWER, LABS_NOW, CABIN];

export const spriteTop = ({ height }: { height: number }) => BASELINE - height;

export function onLandmark(landmark: Landmark, point: { x: number; y: number }) {
  return { x: landmark.x + point.x, y: spriteTop(landmark) + point.y };
}

export const CHIMNEY = onLandmark(CABIN, { x: 48, y: 0 });
export const BEACON = onLandmark(LABS_NOW, { x: 226, y: 0 });
export const DOOR = { ...onLandmark(CABIN, { x: 62, y: 80 }), width: 16, height: 33 };

export type Gem = { x: number; label: string; color: string };

type Place = {
  label: string;
  landmark: Landmark;
  zone: { from: number; to: number };
  markerX: number;
  gems: Gem[];
};

const PLACES: Record<StopId, Place> = {
  pnnl: {
    label: "PNNL",
    landmark: LAB,
    zone: { from: 540, to: 1000 },
    markerX: 770,
    gems: [
      { x: 560, label: "D3", color: "#f2994a" },
      { x: 640, label: "ASP.NET", color: "#a98bf0" },
      { x: 750, label: "Python", color: "#ffd43b" },
      { x: 860, label: "Java", color: "#f2715a" },
    ],
  },
  chewy: {
    label: "Chewy",
    landmark: WAREHOUSE,
    zone: { from: 1400, to: 1860 },
    markerX: 1640,
    gems: [{ x: 1420, label: "React", color: "#61dafb" }],
  },
  atlassian: {
    label: "Atlassian",
    landmark: TOWER,
    zone: { from: 2250, to: 2620 },
    markerX: 2420,
    gems: [
      { x: 2260, label: "C#", color: "#c08cff" },
      { x: 2330, label: "REST APIs", color: "#7ee0a1" },
    ],
  },
  vannevar: {
    label: "Vannevar",
    landmark: LABS_NOW,
    zone: { from: 3050, to: 3480 },
    markerX: 3270,
    gems: [{ x: 3070, label: "Agentic AI", color: "#ffac42" }],
  },
};

const DAILY_TOOLS: Gem[] = [
  { x: 3790, label: "TypeScript", color: "#5b9dff" },
  { x: 3830, label: "Node.js", color: "#79c96b" },
  { x: 3870, label: "AWS", color: "#ffb84d" },
];

export const STOPS = [...experience].reverse().map((stop) => ({
  ...PLACES[stop.id],
  id: stop.id,
  firstYear: stop.span.split(" – ")[0],
}));

export const GEMS = [...STOPS.flatMap((stop) => stop.gems), ...DAILY_TOOLS];

export type TimelineMark = { label: string; caption: string; at: number; destination: Destination };

export const BACK_TO_START: Destination = { kind: "world", x: WALK_START };

export const TIMELINE: TimelineMark[] = [
  { label: "Start", caption: "Back to", at: 0, destination: BACK_TO_START },
  ...STOPS.map((stop) => ({
    label: stop.label,
    caption: stop.firstYear,
    at: progressAt(stop.markerX),
    destination: { kind: "world", x: stop.markerX } as const,
  })),
  { label: "Contact", caption: "Now", at: 1, destination: { kind: "cabin" } },
];
