export function gameUrl(name: string) {
  const path = `/public/game/${name}.png`;
  const url = import.meta.glob<string>("/public/game/**/*.png", { eager: true, query: "?url", import: "default" })[path];
  if (!url) throw new Error(`no art at ${path}`);
  return url;
}
