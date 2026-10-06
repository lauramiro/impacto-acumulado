import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

/** On-screen width and height of every Jaén municipality path (INE codes 23xxx). */
async function jaenSizes(page: Page) {
  await page.locator("path[data-ine^='23']").first().waitFor();
  return page.locator("path[data-ine^='23']").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const tinyShare = (sizes: { w: number; h: number }[]) => sizes.filter((s) => s.w < 10 && s.h < 10).length / sizes.length;

async function pathWidth(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "attached" });
  return el.evaluate((node) => node.getBoundingClientRect().width);
}

test("picking a province zooms the map to it on a phone, and clearing it restores the full view", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  const full = await jaenSizes(page);

  await page.getByRole("region", { name: "Por provincia" }).getByRole("button", { name: "Jaén", exact: true }).click();
  await expect(page).toHaveURL(/provincia=jaen/);
  await expect(page.locator('[data-province="Jaén"]')).toHaveCount(1);
  const zoomed = await jaenSizes(page);

  expect(tinyShare(zoomed)).toBeLessThan(0.2);
  expect(median(zoomed.map((s) => s.w * s.h))).toBeGreaterThan(3 * median(full.map((s) => s.w * s.h)));

  await page.getByRole("region", { name: "Índice de municipios" }).getByRole("button", { name: "Toda Andalucía" }).click();
  await expect(page).not.toHaveURL(/provincia=/);
  const restored = await jaenSizes(page);
  expect(median(restored.map((s) => s.w * s.h))).toBeCloseTo(median(full.map((s) => s.w * s.h)), 1);
});

test("the selected municipality and the overlays follow the province zoom", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const selected = "path[data-ine='23050']";
  const site = "path[data-site]";
  const sensitivity = "path[data-sensitivity]";

  await page.goto("/?natura=1&sensibilidad=fv&m=23050");
  const before = { selected: await pathWidth(page, selected), site: await pathWidth(page, site), sensitivity: await pathWidth(page, sensitivity) };

  await page.goto("/?natura=1&sensibilidad=fv&m=23050&provincia=jaen");
  await expect(page.locator('[data-province="Jaén"]')).toHaveCount(1);
  await expect(page.locator(selected)).toHaveClass(/seleccionado/);
  const after = { selected: await pathWidth(page, selected), site: await pathWidth(page, site), sensitivity: await pathWidth(page, sensitivity) };

  expect(after.selected).toBeGreaterThan(1.8 * before.selected);
  expect(after.site).toBeGreaterThan(1.8 * before.site);
  expect(after.sensitivity).toBeGreaterThan(1.8 * before.sensitivity);
});

test("on a phone the instruction leads with the index; wider screens lead with the map", async ({ page }) => {
  const legend = page.getByRole("complementary", { name: "Leyenda del mapa" });
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(legend.getByText(/^Usa el índice de abajo/)).toBeVisible();
  await expect(legend.getByText(/^Pulsa un municipio/)).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(legend.getByText(/^Pulsa un municipio/)).toBeVisible();
  await expect(legend.getByText(/^Usa el índice de abajo/)).toBeHidden();
});

/** The on-screen width of Sevilla's municipality path (41091). */
const sevillaWidth = (page: Page) => pathWidth(page, "path[data-ine='41091']");

test("the zoom buttons enlarge the map, keep the province names their size, and Todo el mapa restores it", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("svg[data-zoom]");
  await expect(svg).toHaveAttribute("data-zoom", "1.00");
  const before = await sevillaWidth(page);
  const label = page.locator("[data-province-label='Sevilla']");
  const labelSize = await label.evaluate((el) => getComputedStyle(el).fontSize);

  await page.getByRole("button", { name: "Acercar el mapa" }).click();
  await expect(svg).toHaveAttribute("data-zoom", "2.00");
  expect(await sevillaWidth(page)).toBeGreaterThan(1.8 * before);
  expect(await label.evaluate((el) => getComputedStyle(el).fontSize)).toBe(labelSize);

  await page.getByRole("button", { name: "Todo el mapa" }).click();
  await expect(svg).toHaveAttribute("data-zoom", "1.00");
  await expect(page.getByRole("button", { name: "Alejar el mapa" })).toBeDisabled();
});

test("Ctrl and the wheel zoom the map; the wheel alone scrolls the page and says how to zoom", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("svg[data-zoom]");
  // The map starts below the fold at the default viewport: bring it into view before pointing at it.
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await page.mouse.wheel(0, 200);
  await expect(page.getByText(/Para ampliar, pulsa Ctrl/)).toBeVisible();
  await expect(svg).toHaveAttribute("data-zoom", "1.00");

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect(svg).not.toHaveAttribute("data-zoom", "1.00");
});

test("dragging a zoomed map pans it without selecting a municipality; a click still selects", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("svg[data-zoom]");
  await page.getByRole("button", { name: "Acercar el mapa" }).click();
  await page.getByRole("button", { name: "Acercar el mapa" }).click();
  const layers = page.getByTestId("capas-mapa");
  const before = await layers.getAttribute("transform");
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 8 });
  await page.mouse.up();
  await expect(layers).not.toHaveAttribute("transform", before!);
  await expect(page).not.toHaveURL(/[?&]m=/);

  await page.mouse.click(cx, cy);
  await expect(page).toHaveURL(/[?&]m=\d{5}/);
});

test("picking a province returns a free zoom to the province view", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("svg[data-zoom]");
  await page.getByRole("button", { name: "Acercar el mapa" }).click();
  await expect(svg).toHaveAttribute("data-zoom", "2.00");
  await page.getByRole("region", { name: "Por provincia" }).getByRole("button", { name: "Jaén", exact: true }).click();
  await expect(page).toHaveURL(/provincia=jaen/);
  await expect(svg).toHaveAttribute("data-zoom", "1.00");
});

test("on a phone the zoom buttons are full-size touch targets", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  const plus = page.getByRole("button", { name: "Acercar el mapa" });
  const size = (await plus.boundingBox())!;
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
});
