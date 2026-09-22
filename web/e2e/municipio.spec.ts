import { expect, test } from "@playwright/test";

test("municipality page shows heading, totals and gazette links", async ({ page }) => {
  await page.goto("/municipio/29084");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ronda");
  await expect(page.getByText("INE 29084")).toBeVisible();
  await expect(page.getByTestId("dateline").first()).toContainText("Datos a");
  await expect(page.getByRole("region", { name: "Sensibilidad ambiental" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Red Natura 2000" })).toBeVisible();
});

test("a municipality with projects links every document to the gazette", async ({ page }) => {
  await page.goto("/municipio/11020");
  const links = page.locator("a[href^='https://www.boe.es/']");
  expect(await links.count()).toBeGreaterThan(0);
  await expect(page.getByRole("region", { name: "Totales" })).toBeVisible();
});

test("unknown INE is a 404", async ({ page }) => {
  const response = await page.goto("/municipio/00000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Volver al mapa" })).toBeVisible();
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/municipio/11020");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("each project record links to its project page", async ({ page }) => {
  await page.goto("/municipio/11020");
  const link = page.locator("a[href^='/proyecto/']").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/proyecto\/\d+$/);
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
});
