export function createToastLayer(view: HTMLElement) {
  const layer = view.querySelector<HTMLElement>(".walk-toasts")!;
  let transformed: number | null = null;
  let published: number | null = null;

  return {
    follow(camera: number, scale: number, scrolling: boolean) {
      const hasToasts = layer.childElementCount > 0;
      const camVarWouldRestyleToasts = hasToasts && scrolling;
      if (hasToasts && camera !== transformed) {
        transformed = camera;
        layer.style.transform = `translateX(${-camera * scale}px)`;
      }
      if (camera !== published && !camVarWouldRestyleToasts) {
        published = camera;
        layer.style.setProperty("--cam", `${camera}`);
      }
    },
  };
}
