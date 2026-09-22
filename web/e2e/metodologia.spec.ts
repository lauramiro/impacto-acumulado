import { expect, test } from "@playwright/test";

test("methodology page publishes per-field accuracy with its sample size", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metodología");
  const table = page.getByRole("table", { name: "Precisión por campo" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("muestra")).toContainText(/sobre \d+ documentos/);
  await expect(page.getByRole("link", { name: /etiquetas/ })).toHaveAttribute("href", /github\.com/);
});
