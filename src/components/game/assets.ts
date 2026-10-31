import { LANDMARKS } from "./world";

export const DAN_SHEET = { width: 57, height: 78 };
export const MISHKA_SHEET = { width: 51, height: 38 };
export const TREE_SHEET = { width: 110, height: 170 };
export const PROP_SHEET = { width: 69, height: 40, count: 8 };
export const CLOUD_KINDS = 6;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });

const game = (name: string) => load(`/game/${name}.png`);

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
  const [dan, sun, moon, mishka, rainier, trees, props, clouds, cascades, foothills, meadow, seattle, wide, tall, landmarks] = await Promise.all([
    game("dan"),
    game("sun"),
    game("moon"),
    game("mishka"),
    game("rainier"),
    game("trees"),
    game("props"),
    game("clouds"),
    game("cascades"),
    game("foothills"),
    game("meadow"),
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
  return { dan, sun, moon, mishka, rainier, trees, props, clouds, cascades, foothills, meadow, seattle, rooms: { wide, tall }, landmarks };
}

export type Art = Awaited<ReturnType<typeof loadArt>>;
