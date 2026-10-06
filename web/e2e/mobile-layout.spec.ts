import { expect, test, type Locator } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const noPageOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** The share of the element inside the viewport, 0 to 1. */
async function visibleShare(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return Math.max(0, h) / r.height;
  });
}

test("the group table on /promotores fits a phone and shows Proyectos and MW", async ({ page }) => {
  await page.goto("/promotores");
  const section = page.getByRole("region", { name: "Por grupo o familia de nombres" });
  expect(await noPageOverflow(page)).toBe(true);
  for (const name of [/Proyectos/, /MW aprobados/]) {
    const box = await section.getByRole("columnheader", { name }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await expect(section.getByRole("columnheader", { name: /Matriz/ })).toBeHidden();
  await expect(section.getByText("familia de nombres, sin fuente").first()).toBeHidden();
});

test("the Natura 2000 table has no element wider than a phone", async ({ page }) => {
  await page.goto("/");
  const table = page.locator("#natura-tabla");
  await table.scrollIntoViewIfNeeded();
  const widest = await table.evaluate((t) => Math.max(...[t, ...t.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(390);
});

test("choosing a province in the table brings the map into view", async ({ page }) => {
  await page.goto("/");
  const mapa = page.locator("#mapa > div").first();
  await page.getByRole("button", { name: "Cádiz", exact: true }).scrollIntoViewIfNeeded();
  expect(await visibleShare(mapa)).toBeLessThan(0.2);
  await page.getByRole("button", { name: "Cádiz", exact: true }).click();
  await expect.poll(() => visibleShare(mapa), { timeout: 5000 }).toBeGreaterThan(0.5);
});

test("choosing a metric brings the map into view", async ({ page }) => {
  await page.goto("/");
  const mapa = page.locator("#mapa > div").first();
  const hectareas = page.getByRole("radio", { name: /Hectáreas/ });
  await hectareas.scrollIntoViewIfNeeded();
  await hectareas.check({ force: true });
  await expect.poll(() => visibleShare(mapa), { timeout: 5000 }).toBeGreaterThan(0.5);
});
