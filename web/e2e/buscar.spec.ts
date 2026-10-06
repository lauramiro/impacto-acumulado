import { expect, test } from "@playwright/test";

const box = (page: import("@playwright/test").Page) => page.getByRole("search").getByRole("combobox", { name: /Buscar municipio, espacio protegido/ });

test("the header search finds a municipality and opens its page", async ({ page }) => {
  await page.goto("/resultados");
  await box(page).fill("ronda");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("Ronda");
  await expect(first).toContainText("Municipio · Málaga");
  await box(page).press("Enter");
  await expect(page).toHaveURL(/\/municipio\/29084$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ronda");
});

test("the header search finds a project by its expediente, whatever the separators", async ({ page }) => {
  await page.goto("/acerca");
  await box(page).fill("aau hu 057 21");
  const option = page.getByRole("option", { name: /Proyecto/ }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/proyecto\/43$/);
});

test("a protected site opens the home page with the Natura table filtered to it", async ({ page }) => {
  await page.goto("/metodologia");
  await box(page).fill("doñana");
  await page.getByRole("option", { name: /Red Natura 2000/ }).first().click();
  await expect(page).toHaveURL(/natura=1&espacio=ES\w+#natura$/);
  const table = page.getByRole("region", { name: "Red Natura 2000" });
  await expect(table.getByLabel("Buscar espacio")).toHaveValue(/^ES\w+$/);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr")).toContainText("Doñana");
});

test("slash focuses the search, Escape clears it, and no match says so", async ({ page }) => {
  await page.goto("/datos");
  // The shortcut works once the page is interactive: retry the key until it is.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(box(page)).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.type("zzqx");
  await expect(page.getByRole("search").getByRole("paragraph").filter({ hasText: "Nada coincide con la búsqueda." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box(page)).toHaveValue("");
});

test("on a phone the header search spans the width and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/proyectos");
  const width = await box(page).evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(300);
  await box(page).fill("iberdrola");
  await expect(page.getByRole("option").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
