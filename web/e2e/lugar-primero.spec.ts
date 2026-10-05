import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const DATA = path.join(__dirname, "..", "public", "data");

test("the place search is in the first 600 px at desktop size, above the map, and selects a municipality", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  const search = page.getByRole("combobox", { name: "Buscar un municipio" });
  const box = await search.boundingBox();
  const map = await page.locator("#mapa svg").first().boundingBox();
  expect(box!.y + box!.height).toBeLessThan(600);
  expect(box!.y).toBeLessThan(map!.y);

  await search.fill("aznalc");
  await page.getByRole("option", { name: /Aznalcóllar/ }).click();
  await expect(page).toHaveURL(/[?&]m=41013(&|$)/);
  await expect(page.getByRole("complementary", { name: "Municipio seleccionado" }).getByRole("heading", { level: 2, name: "Aznalcóllar" })).toBeVisible();
  await expect(page.locator("path[data-ine='41013']")).toHaveClass(/seleccionado/);
});

test("a pick keeps the rest of the state in the URL", async ({ page }) => {
  await page.goto("/?metrica=ha");
  await page.locator("path[data-ine]").first().waitFor();
  const search = page.getByRole("combobox", { name: "Buscar un municipio" });
  await search.fill("ronda");
  await search.press("Enter");
  await expect(page).toHaveURL(/metrica=ha/);
  await expect(page).toHaveURL(/m=29084/);
});

test("on a phone the place search is on the first screen and a pick brings the panel into view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // The map is drawn once the page has hydrated and read its state from the URL.
  await page.locator("path[data-ine]").first().waitFor();
  const search = page.getByRole("combobox", { name: "Buscar un municipio" });
  await expect(search).toBeInViewport();
  await search.fill("ronda");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/m=29084/);
  await expect(page.getByRole("complementary", { name: "Municipio seleccionado" }).getByRole("heading", { level: 2, name: "Ronda" })).toBeInViewport();
});

test("a search with no match says so", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Buscar un municipio" }).fill("zzzz");
  await expect(page.getByText("Ningún municipio coincide con la búsqueda.").first()).toBeVisible();
});

test("the map names the provinces", async ({ page }) => {
  await page.goto("/");
  const labels = page.getByTestId("rotulos-provincias").locator("text");
  await expect(labels).toHaveCount(8);
  await expect(page.locator("[data-province-label='Sevilla']")).toBeVisible();
  await expect(page.locator("[data-province-label='Almería']")).toBeVisible();
});

test("one denominator: the legend counts the headline's projects, and the index does not lead with a refused project", async ({ page }) => {
  await page.goto("/");
  const headline = (await page.locator("p", { hasText: "Aprobados o en trámite:" }).first().textContent()) ?? "";
  const [, declared, total] = headline.match(/MW declarados en ([\d.]+) de ([\d.]+) proyectos/) ?? [];
  expect(total).toBeTruthy();
  await expect(page.getByTestId("cobertura-mapa")).toContainText(`MW declarados en ${declared} de ${total} proyectos`);
  await expect(page.getByTestId("nota-base")).toContainText("aprobados o en trámite");

  // Jimena de la Frontera ranked first with the refused 801 MW project 27; it must not any more.
  const first = page.getByRole("region", { name: "Índice de municipios" }).locator("tbody tr").first();
  await expect(first.getByRole("rowheader")).not.toHaveText("Jimena de la Frontera");
  const stats: Record<string, { cells: { status: string; mw_best: number }[] }> = JSON.parse(readFileSync(path.join(DATA, "municipality_stats.json"), "utf-8"));
  const accumulating = (ine: string) =>
    stats[ine]!.cells.filter((c) => !["desfavorable", "caducado"].includes(c.status)).reduce((a, c) => a + c.mw_best, 0);
  const best = Object.keys(stats).sort((a, b) => accumulating(b) - accumulating(a))[0]!;
  await expect(first.getByRole("link")).toHaveAttribute("href", `/municipio/${best}`);
});

test("with every status on, the note says the basis differs from the headline", async ({ page }) => {
  await page.goto("/?estado=en_consulta,sin_resolucion,favorable,favorable_condicionada,desfavorable,caducado,desconocido");
  await expect(page.getByTestId("nota-base")).toContainText("no cuentan lo mismo que el titular");
});

test("on a phone the province table shows Provincia and Total, and a tap unfolds the statuses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: "Provincia" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Total" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Favorable con condiciones" })).toBeHidden();
  const right = await table.locator("table").evaluate((t) => t.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const unfold = table.getByRole("button", { name: "Estados de Sevilla" });
  await expect(unfold).toHaveAttribute("aria-expanded", "false");
  await unfold.click();
  await expect(unfold).toHaveAttribute("aria-expanded", "true");
  await expect(table.locator("dl").getByText("Favorable con condiciones")).toBeVisible();
  await unfold.click();
  await expect(table.locator("dl")).toHaveCount(0);
});

test("on a phone the map spans the content width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const box = await page.locator("#mapa svg").first().boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(390 - 2 * 16 - 1);
  expect(box!.x).toBeLessThanOrEqual(16);
});

test("at desktop size the province table keeps every column and no phone control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: "Favorable con condiciones" })).toBeVisible();
  await expect(table.getByRole("button", { name: /^Estados de / })).toHaveCount(0);
});
