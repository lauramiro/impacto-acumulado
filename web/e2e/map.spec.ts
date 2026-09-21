import { expect, test } from "@playwright/test";

test("map renders every municipality from the light geojson and the date line", async ({ page }) => {
  const geojson = page.waitForResponse((r) => r.url().endsWith("/data/municipalities_map.geojson") && r.ok());
  await page.goto("/");
  await geojson;
  await expect(page.getByTestId("dateline").first()).toContainText("Datos a");
  await expect(page.locator("path[data-ine]")).toHaveCount(785);
});

test("switching metric updates the legend and the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Hectáreas").check();
  await expect(page).toHaveURL(/metrica=ha/);
  await expect(page.getByRole("list", { name: "Leyenda" })).toContainText("ha");
});

test("clicking a municipality opens the panel with a link to its page", async ({ page }) => {
  await page.goto("/");
  await page.locator("path[data-ine='11020']").waitFor();
  await page.locator("path[data-ine='11020']").dispatchEvent("click");
  await expect(page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" })).toBeVisible();
  await page.getByRole("link", { name: "Ver municipio" }).click();
  await expect(page).toHaveURL(/\/municipio\/11020$/);
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
