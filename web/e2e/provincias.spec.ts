import { expect, test } from "@playwright/test";
import { openFilters } from "./filters";

test("province table follows the status filter and selects a province", async ({ page }) => {
  await page.goto("/");
  await openFilters(page);
  const table = page.getByRole("region", { name: "Por provincia" });
  // Refused projects are not in the default statuses, so they have no column until ticked.
  await expect(table.getByRole("columnheader", { name: "Desfavorable" })).toHaveCount(0);
  await expect(table.getByRole("rowheader", { name: "Andalucía" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Con MW declarado" })).toBeVisible();
  await page.getByRole("checkbox", { name: /^Desfavorable \(/ }).check();
  await expect(table.getByRole("columnheader", { name: "Desfavorable" })).toBeVisible();
  await page.getByRole("checkbox", { name: /^Desfavorable \(/ }).uncheck();
  await expect(table.getByRole("columnheader", { name: "Desfavorable" })).toHaveCount(0);
  const sevilla = table.getByRole("button", { name: "Sevilla" });
  await sevilla.click();
  await expect(sevilla).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/provincia=sevilla/);
  await sevilla.click();
  await expect(page).not.toHaveURL(/provincia=/);
});

test("province table with hectares has a surface coverage column instead of the MW one", async ({ page }) => {
  await page.goto("/?metrica=ha");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: "Con MW declarado" })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Con superficie declarada" })).toBeVisible();
});

test("province table counting projects has no coverage column", async ({ page }) => {
  await page.goto("/?metrica=proyectos");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: /^Con / })).toHaveCount(0);
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

test("the province table fits the content width at desktop size", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const scroller = page.getByRole("region", { name: "Por provincia" }).locator("table").locator("..");
  const clipped = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
});

test("selecting a province outlines it on the map and limits the municipality index", async ({ page }) => {
  await page.goto("/");
  const count = page.getByTestId("indice-recuento");
  await expect(count).not.toContainText("provincia");
  await page.getByRole("region", { name: "Por provincia" }).getByRole("button", { name: "Cádiz" }).click();
  await expect(page.locator('[data-province="Cádiz"]')).toHaveCount(1);
  await expect(count).toContainText("en la provincia de Cádiz");
  const index = page.getByRole("region", { name: "Índice de municipios" });
  await expect(index.getByRole("cell", { name: "Sevilla", exact: true })).toHaveCount(0);
  await index.getByRole("button", { name: "Toda Andalucía" }).click();
  await expect(page).not.toHaveURL(/provincia=/);
  await expect(page.locator("[data-province]")).toHaveCount(0);
  await expect(count).not.toContainText("provincia");
});

test("province table leaves out status columns that are empty everywhere and names them", async ({ page }) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("columnheader", { name: "Favorable con condiciones" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Favorable", exact: true })).toHaveCount(0);
  // Other statuses may be empty too, depending on the data; Favorable always is.
  await expect(table.getByText(/Estados sin columna por estar vacíos en toda Andalucía: (.*; )?Favorable \(ningún proyecto\)/)).toBeVisible();
});

test("on a phone, picking a province confirms it under the table with a link to the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  const status = table.getByRole("status");
  await expect(status).toBeEmpty();
  await table.getByRole("button", { name: "Cádiz", exact: true }).click();
  await expect(status).toBeInViewport();
  await expect(status).toHaveText(/^Cádiz marcada en el mapa · [\d.]+ municipios? en el índice · Ver el mapa$/);
  const count = (await page.getByTestId("indice-recuento").textContent())?.match(/^[\d.]+/)?.[0];
  await expect(status).toContainText(`${count} municipio`);
  await status.getByRole("link", { name: "Ver el mapa" }).click();
  await expect(page.locator("#mapa")).toBeInViewport();
  await table.getByRole("button", { name: "Cádiz", exact: true }).click();
  await expect(status).toBeEmpty();
});

test("province table marks cells with no projects apart from sin dato and defines both", async ({ page }) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "Por provincia" });
  await expect(table.getByRole("cell", { name: "ningún proyecto" }).first()).toBeVisible();
  await expect(table.getByText("«–»: ningún proyecto.", { exact: false })).toBeVisible();
  await expect(table.getByText("«sin dato»: hay proyectos, pero ninguno declara MW.", { exact: false })).toBeVisible();
});

test("status checkbox counts follow the technology filter and match the province table total", async ({ page }) => {
  await page.goto("/?tecnologia=eolica&metrica=proyectos");
  await openFilters(page);
  const table = page.getByRole("region", { name: "Por provincia" });
  const headers = await table.getByRole("columnheader").allTextContents();
  const column = headers.indexOf("Favorable con condiciones");
  expect(column).toBeGreaterThan(0);
  const total = (await table.getByRole("row").last().getByRole("cell").nth(column - 1).textContent())?.match(/^[\d.]+/)?.[0];
  await expect(page.getByRole("checkbox", { name: `Favorable con condiciones (${total})` })).toHaveCount(1);
  await page.getByRole("button", { name: "Desmarcar todos: tecnologías" }).click();
  await expect(page.getByRole("checkbox", { name: "Favorable con condiciones (0)" })).toHaveCount(1);
});
