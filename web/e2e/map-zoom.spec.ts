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
