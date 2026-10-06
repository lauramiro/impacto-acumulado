import { describe, expect, it } from "vitest";
import { clampView, IDENTITY, MAX_ZOOM, panBy, zoomAt } from "@/lib/zoom";

const W = 1000;
const H = 560;

describe("zoomAt", () => {
  it("keeps the point under the cursor where it was", () => {
    const v = zoomAt(IDENTITY, 2, 300, 200, W, H);
    expect(v.k).toBe(2);
    // The point (300, 200) maps to 300 * 2 + x = 300 and 200 * 2 + y = 200.
    expect(300 * v.k + v.x).toBeCloseTo(300);
    expect(200 * v.k + v.y).toBeCloseTo(200);
  });
  it("never zooms out past the whole map or in past the maximum", () => {
    expect(zoomAt(IDENTITY, 0.5, 500, 280, W, H)).toEqual(IDENTITY);
    expect(zoomAt({ k: 6, x: 0, y: 0 }, 4, 0, 0, W, H).k).toBe(MAX_ZOOM);
  });
  it("zooming back out to 1 returns to the whole map", () => {
    const v = zoomAt(zoomAt(IDENTITY, 4, 900, 500, W, H), 0.25, 100, 100, W, H);
    expect(v).toEqual(IDENTITY);
  });
});

describe("clampView and panBy", () => {
  it("does not pan past the map's edges", () => {
    expect(panBy({ k: 2, x: -100, y: -100 }, 500, 500, W, H)).toEqual({ k: 2, x: 0, y: 0 });
    expect(panBy({ k: 2, x: -100, y: -100 }, -5000, -5000, W, H)).toEqual({ k: 2, x: -W, y: -H });
  });
  it("cannot pan the whole map at zoom 1", () => {
    expect(clampView({ k: 1, x: -40, y: 30 }, W, H)).toEqual(IDENTITY);
  });
});
