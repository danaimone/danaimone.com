import { experience, type StopId } from "../../data/resume";
import { WALK_START, progressAt, type Destination } from "./track";

export const WORLD_WIDTH = 4260;
const BASELINE = 2;
export const PROMOTION_X = 2480;

type Sign = { logo: string; x: number; y: number; size: number };

type Landmark = {
  name: string;
  x: number;
  width: number;
  height: number;
  lights: { daylight: number } | null;
  sign: Sign | null;
  focus: { x: number; width: number };
};

const TRAIL_SIGN: Landmark = { name: "sign", x: 150, width: 63, height: 50, lights: null, sign: null, focus: { x: 0, width: 63 } };
const LAB: Landmark = { name: "lab", x: 590, width: 510, height: 224, lights: { daylight: 0.1 }, sign: null, focus: { x: 400, width: 100 } };
const CHEWY_OFFICE: Landmark = { name: "chewy", x: 1500, width: 453, height: 205, lights: { daylight: 0 }, sign: null, focus: { x: 134, width: 136 } };
const TOWER: Landmark = { name: "tower", x: 2350, width: 146, height: 224, lights: { daylight: 0 }, sign: { logo: "atlassian", x: 10, y: -16, size: 40 }, focus: { x: 0, width: 80 } };
const LABS_NOW: Landmark = { name: "labsnow", x: 3150, width: 238, height: 132, lights: { daylight: 0.45 }, sign: null, focus: { x: 150, width: 75 } };
const CABIN: Landmark = { name: "cabin", x: 3980, width: 197, height: 124, lights: { daylight: 0 }, sign: null, focus: { x: 0, width: 197 } };

export const LANDMARKS = [TRAIL_SIGN, LAB, CHEWY_OFFICE, TOWER, LABS_NOW, CABIN];

export const spriteTop = ({ height }: { height: number }) => BASELINE - height;

function onLandmark(landmark: Landmark, point: { x: number; y: number }) {
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
  cardSide: "left" | "right";
  gems: Gem[];
};

const PLACES: Record<StopId, Place> = {
  pnnl: {
    label: "PNNL",
    landmark: LAB,
    zone: { from: 540, to: 1000 },
    markerX: 770,
    cardSide: "left",
    gems: [
      { x: 560, label: "D3", color: "#f2994a" },
      { x: 640, label: "ASP.NET", color: "#a98bf0" },
      { x: 750, label: "Python", color: "#ffd43b" },
      { x: 860, label: "Java", color: "#f2715a" },
    ],
  },
  chewy: {
    label: "Chewy",
    landmark: CHEWY_OFFICE,
    zone: { from: 1400, to: 1860 },
    markerX: 1640,
    cardSide: "right",
    gems: [{ x: 1420, label: "React", color: "#61dafb" }],
  },
  atlassian: {
    label: "Atlassian",
    landmark: TOWER,
    zone: { from: 2250, to: 2620 },
    markerX: 2420,
    cardSide: "right",
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
    cardSide: "right",
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

type TimelineMark = { label: string; caption: string; at: number; destination: Destination };

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
