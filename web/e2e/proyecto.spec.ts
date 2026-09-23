import { expect, test } from "@playwright/test";

test("project page shows the record, the timeline and which document fixed the status", async ({ page }) => {
  await page.goto("/proyecto/1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Las Quinientas");
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Documentos/ })).toBeVisible();
  await expect(page.getByTestId("fija-estado")).toHaveCount(1);
  // agrupado's count reflects how many documents got grouped into this
  // project, which shifts as the weekly workflow commits fresh data to
  // main; pin only that at least one mark is present, not the exact count,
  // so a routine regrouping does not break the weekly run.
  const agrupado = page.getByTestId("agrupado");
  expect(await agrupado.count()).toBeGreaterThan(0);
  await expect(agrupado.first()).toContainText("Agrupado con confianza");
  expect(await page.locator("a[href^='https://www.boe.es/']").count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /Jerez de la Frontera/ })).toHaveAttribute("href", "/municipio/11020");
  await expect(page.getByRole("region", { name: "Cómo se ha construido esta ficha" })).toBeVisible();
  const noAplicaRow = page.locator("li", { hasText: "BOE-A-2020-14181" });
  await expect(noAplicaRow).toContainText("No aplica");
  await expect(noAplicaRow.locator("[data-status]")).toHaveCount(0);
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
