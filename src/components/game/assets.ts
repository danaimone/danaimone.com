import { gameUrl } from "./art-url";
import { LANDMARKS } from "./world";

export const DAN_SHEET = { width: 57, height: 78 };
export const MISHKA_SHEET = { width: 51, height: 38 };
export const TREE_SHEET = { width: 112, height: 170, count: 14 };
export const PROP_SHEET = { width: 64, height: 48, count: 26 };
export const CLOUD_KINDS = 6;

const load = async (src: string) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
};

const game = (name: string) => load(gameUrl(name));

const loadRoom = async (name: "wide" | "tall") => {
  const [plate, fire, hands, mishka, screen, side] = await Promise.all([
    game(name === "wide" ? "interior" : "interior-tall"),
    game(`room-${name}-fire`),
    game(`room-${name}-hands`),
    game(`room-${name}-mishka`),
    game(`room-${name}-screen`),
    game(`room-${name}-side`),
  ]);
  return { plate, fire, hands, mishka, screen, side };
};

export type RoomArt = Awaited<ReturnType<typeof loadRoom>>;

export async function loadArt() {
  const [dan, sun, moon, mishka, rainier, trees, props, clouds, rattlesnake, olympics, issaquah, foothills, foothillsDry, foothillsTurn, meadow, meadowDry, meadowTurn, seattle, wide, tall, landmarks] = await Promise.all([
    game("dan"),
    game("sun"),
    game("moon"),
    game("mishka"),
    game("rainier"),
    game("trees"),
    game("props"),
    game("clouds"),
    game("skyline-rattlesnake"),
    game("skyline-olympics"),
    game("skyline-issaquah"),
    game("foothills"),
    game("foothills-dry"),
    game("foothills-turn"),
    game("meadow"),
    game("meadow-dry"),
    game("meadow-turn"),
    game("seattle"),
    loadRoom("wide"),
    loadRoom("tall"),
    Promise.all(
      LANDMARKS.map(async (landmark) => {
        const [sprite, lights, logo] = await Promise.all([
          game(landmark.name),
          landmark.lights ? game(`${landmark.name}-lights`) : null,
          landmark.sign ? game(`logos/${landmark.sign.logo}`) : null,
        ]);
        return { landmark, sprite, lights, logo };
      }),
    ),
  ]);
  return { dan, sun, moon, mishka, rainier, trees, props, clouds, skylines: [rattlesnake, olympics, issaquah], foothills: { before: foothillsDry, turn: foothillsTurn, after: foothills }, meadow: { before: meadowDry, turn: meadowTurn, after: meadow }, seattle, rooms: { wide, tall }, landmarks };
}

export type Art = Awaited<ReturnType<typeof loadArt>>;
