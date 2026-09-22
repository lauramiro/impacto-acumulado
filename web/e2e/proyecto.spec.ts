import { expect, test } from "@playwright/test";

test("project page shows the record, the timeline and which document fixed the status", async ({ page }) => {
  await page.goto("/proyecto/1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Las Quinientas");
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Documentos/ })).toBeVisible();
  await expect(page.getByTestId("fija-estado")).toHaveCount(1);
  await expect(page.getByTestId("agrupado")).toHaveCount(2);
  await expect(page.getByTestId("agrupado").first()).toContainText("Agrupado con confianza");
  expect(await page.locator("a[href^='https://www.boe.es/']").count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /Jerez de la Frontera/ })).toHaveAttribute("href", "/municipio/11020");
  await expect(page.getByRole("region", { name: "Cómo se ha construido esta ficha" })).toBeVisible();
});

test("unknown project id is a 404", async ({ page }) => {
  const response = await page.goto("/proyecto/999999");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Volver al mapa" })).toBeVisible();
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/proyecto/1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
