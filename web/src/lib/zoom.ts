/** A zoom on the map: scale `k`, then a translation `x`, `y` in viewBox units. */
export type View = { k: number; x: number; y: number };

export const IDENTITY: View = { k: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;

/** The view kept inside the map: no zoom below the whole map, no pan past its edges. */
export function clampView(v: View, width: number, height: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
  return {
    k,
    x: Math.min(0, Math.max(width * (1 - k), v.x)),
    y: Math.min(0, Math.max(height * (1 - k), v.y)),
  };
}

/** Zoom by `factor` keeping the point (`cx`, `cy`), in viewBox units, where it is on screen. */
export function zoomAt(v: View, factor: number, cx: number, cy: number, width: number, height: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
  const r = k / v.k;
  return clampView({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }, width, height);
}

/** Move by (`dx`, `dy`) viewBox units. */
export function panBy(v: View, dx: number, dy: number, width: number, height: number): View {
  return clampView({ k: v.k, x: v.x + dx, y: v.y + dy }, width, height);
}

/** The SVG transform for the view. */
export const transformOf = (v: View) => `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.k.toFixed(4)})`;
