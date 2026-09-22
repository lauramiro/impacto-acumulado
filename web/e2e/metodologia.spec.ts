import { expect, test } from "@playwright/test";

test("methodology page publishes per-field accuracy with its sample size", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metodología");
  const table = page.getByRole("table", { name: "Precisión por campo" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  // evaluation.json currently scores 11 fields; a hardcoded table, a dropped
  // field or stale figures must fail this, not just an emptied-out table.
  await expect(rows).toHaveCount(11);
  await expect(table.getByRole("row", { name: /Nombre del proyecto/ })).toContainText("40 %");
  await expect(page.getByTestId("muestra")).toContainText(/sobre \d+ documentos/);
  await expect(page.getByTestId("muestra")).toContainText(/mistral/);
  await expect(page.getByRole("link", { name: /etiquetas/ })).toHaveAttribute("href", /github\.com/);
});
