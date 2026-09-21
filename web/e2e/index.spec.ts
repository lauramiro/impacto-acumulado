import { expect, test } from "@playwright/test";

test("index is searchable and reachable by keyboard", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Buscar municipio");
  await search.fill("jerez");
  const row = page.getByRole("row", { name: /Jerez de la Frontera/ });
  await expect(row).toBeVisible();
  await search.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/municipio\/11020$/);
});

test("index count follows the status filter", async ({ page }) => {
  await page.goto("/");
  const count = page.getByTestId("indice-recuento");
  const before = await count.textContent();
  await page.getByLabel("Favorable con condiciones").uncheck();
  await expect(count).not.toHaveText(before ?? "");
});
