import { gameUrl } from "./art-url";
import { LANDMARKS } from "./world";

const load = async (src: string) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
};

const game = (name: string) => load(gameUrl(name));

export const loadRoom = async (name: "wide" | "tall") => {
  const [plate, hands, mishka, screen, side] = await Promise.all([
    game(name === "wide" ? "interior" : "interior-tall"),
    game(`room-${name}-hands`),
    game(`room-${name}-mishka`),
    game(`room-${name}-screen`),
    game(`room-${name}-side`),
  ]);
  return { plate, hands, mishka, screen, side };
};

export type RoomArt = Awaited<ReturnType<typeof loadRoom>>;

const SCENERY = {
  dan: "dan",
  sun: "sun",
  moon: "moon",
  mishka: "mishka",
  rainier: "rainier",
  trees: "trees",
  props: "props",
  clouds: "clouds",
  rattlesnake: "skyline-rattlesnake",
  olympics: "skyline-olympics",
  issaquah: "skyline-issaquah",
  foothills: "foothills",
  foothillsDry: "foothills-dry",
  foothillsTurn: "foothills-turn",
  meadow: "meadow",
  meadowDry: "meadow-dry",
  meadowTurn: "meadow-turn",
  seattle: "seattle",
};

const landmarkArt = ({ name, lights, sign }: (typeof LANDMARKS)[number]) => ({
  sprite: name,
  lights: lights ? `${name}-lights` : null,
  logo: sign ? `logos/${sign.logo}` : null,
});

export const walkArtUrls = () =>
  [...Object.values(SCENERY), ...LANDMARKS.flatMap((landmark) => Object.values(landmarkArt(landmark)))].filter((name) => name !== null).map(gameUrl);

async function loadScenery() {
  const images = await Promise.all(Object.values(SCENERY).map(game));
  return Object.fromEntries(Object.keys(SCENERY).map((key, i) => [key, images[i]])) as Record<keyof typeof SCENERY, HTMLImageElement>;
}

export async function loadArt() {
  const [scenery, landmarks] = await Promise.all([
    loadScenery(),
    Promise.all(
      LANDMARKS.map(async (landmark) => {
        const names = landmarkArt(landmark);
        const [sprite, lights, logo] = await Promise.all([game(names.sprite), names.lights ? game(names.lights) : null, names.logo ? game(names.logo) : null]);
        return { landmark, sprite, lights, logo };
      }),
    ),
  ]);
  const { dan, sun, moon, mishka, rainier, trees, props, clouds, rattlesnake, olympics, issaquah, foothills, foothillsDry, foothillsTurn, meadow, meadowDry, meadowTurn, seattle } = scenery;
  return { dan, sun, moon, mishka, rainier, trees, props, clouds, skylines: [rattlesnake, olympics, issaquah], foothills: { before: foothillsDry, turn: foothillsTurn, after: foothills }, meadow: { before: meadowDry, turn: meadowTurn, after: meadow }, seattle, landmarks };
}

export type Art = Awaited<ReturnType<typeof loadArt>>;
