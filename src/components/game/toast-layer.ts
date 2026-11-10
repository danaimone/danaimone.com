// Toasts track world positions, so their layer takes the camera as a plain
// transform. The camera is also published as --cam for tooling, but not while
// a toast is scrolling past: it inherits, and would restyle the toast each frame.
export function createToastLayer(view: HTMLElement) {
  const layer = view.querySelector<HTMLElement>(".walk-toasts")!;
  let transformed: number | null = null;
  let published: number | null = null;

  return {
    follow(camera: number, scale: number, scrolling: boolean) {
      const hasToasts = layer.childElementCount > 0;
      if (hasToasts && camera !== transformed) {
        transformed = camera;
        layer.style.transform = `translateX(${-camera * scale}px)`;
      }
      if (camera !== published && !(hasToasts && scrolling)) {
        published = camera;
        layer.style.setProperty("--cam", `${camera}`);
      }
    },
  };
}
