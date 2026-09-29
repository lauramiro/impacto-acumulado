import { expect, test } from "@playwright/test";

test("province table follows the status filter and selects a province", async ({ page }) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: "Desfavorable" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Andalucía" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Con MW declarado" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Desfavorable", exact: true }).uncheck();
  await expect(table.getByRole("columnheader", { name: "Desfavorable" })).toHaveCount(0);
  const sevilla = table.getByRole("button", { name: "Sevilla" });
  await sevilla.click();
  await expect(sevilla).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/provincia=sevilla/);
  await sevilla.click();
  await expect(page).not.toHaveURL(/provincia=/);
});

test("province table without MW has no coverage column", async ({ page }) => {
  await page.goto("/?metrica=ha");
  await expect(page.getByRole("region", { name: "Por provincia" }).getByRole("columnheader", { name: "Con MW declarado" })).toHaveCount(0);
});

test("province table with no status selected says so", async ({ page }) => {
  await page.goto("/?estado=");
  await expect(page.getByRole("region", { name: "Por provincia" }).getByText("Ningún estado seleccionado.")).toBeVisible();
});

test("no horizontal page scroll on a phone with the province table", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.getByRole("region", { name: "Por provincia" }).scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
