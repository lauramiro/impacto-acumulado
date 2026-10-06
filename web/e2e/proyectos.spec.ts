import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// The number of projects follows each weekly export: read it, do not hard-code it.
const PROJECTS = (JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "meta.json"), "utf-8")) as { files: Record<string, { rows: number }> }).files["projects.csv"]!.rows;
const projectsText = (n: number) => n.toLocaleString("es-ES");

test("the project list finds project 43 by its expediente and links to its page", async ({ page }) => {
  await page.goto("/proyectos?q=AAU/HU/057/21");
  const index = page.getByRole("region", { name: "Todos los proyectos" });
  await expect(page.getByLabel("Buscar proyecto")).toHaveValue("AAU/HU/057/21");
  const link = index.locator("a[href='/proyecto/43']");
  await expect(link).toBeVisible();
  await expect(index.getByRole("row", { name: /AAU\/HU\/057\/21/ })).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/proyecto\/43$/);
});

test("the expediente search ignores separators and spacing", async ({ page }) => {
  await page.goto("/proyectos?q=aau%20hu%20057");
  const index = page.getByRole("region", { name: "Todos los proyectos" });
  await expect(index.locator("a[href='/proyecto/43']")).toBeVisible();
  await page.getByLabel("Buscar proyecto").fill("aau-hu-057-21");
  await expect(index.locator("a[href='/proyecto/43']")).toBeVisible();
});

test("the project list searches name and developer, keeps the query in the URL, and filters by status", async ({ page }) => {
  await page.goto("/proyectos");
  const index = page.getByRole("region", { name: "Todos los proyectos" });
  const count = page.getByTestId("proyectos-recuento");
  await expect(count).toHaveText(`${projectsText(PROJECTS)} proyectos`);
  const search = page.getByLabel("Buscar proyecto");
  await search.fill("guadacano");
  await expect(index.getByRole("link", { name: /Guadacano/ }).first()).toBeVisible();
  await expect(page).toHaveURL(/q=guadacano/);
  await search.fill("");
  await expect(page).not.toHaveURL(/q=/);

  await page.getByRole("checkbox", { name: /^Desfavorable \(/ }).uncheck();
  await expect(count).toHaveText(new RegExp(`^[0-9.]+ proyectos de ${projectsText(PROJECTS)}$`));
  await expect(index.locator("[data-status='desfavorable']")).toHaveCount(0);
});

test("a refused project is as findable as an approved one: nothing is filtered or ranked by MW by default", async ({ page }) => {
  await page.goto("/proyectos");
  const index = page.getByRole("region", { name: "Todos los proyectos" });
  await expect(index.getByRole("columnheader", { name: /^Proyecto/ })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("checkbox", { name: /^Desfavorable \(/ })).toBeChecked();
});

test("Proyectos is in the navigation and the sitemap", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Proyectos" }).click();
  await expect(page).toHaveURL(/\/proyectos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("https://impacto-acumulado.vercel.app/proyectos<");
});

test("the project list has no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/proyectos");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The table can be wider than its column without widening the page (there is a gutter); it must not be.
  const [tableRight, columnRight] = await page.evaluate(() => [document.querySelector("table")!.getBoundingClientRect().right, document.querySelector("article")!.getBoundingClientRect().right]);
  expect(tableRight).toBeLessThanOrEqual(columnRight + 0.5);
});
