import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { expect, test } from "@playwright/test";

type ProjectRow = { id: string; technology: string; ine_codes: string };

// Reads the real export, so the test follows whatever the weekly data holds.
function lineProjects(): ProjectRow[] {
  const csv = readFileSync(path.join(__dirname, "..", "public", "data", "projects.csv"), "utf-8");
  return (parse(csv, { columns: true, skip_empty_lines: true }) as ProjectRow[]).filter((r) => r.technology === "linea_evacuacion");
}

function firstLineMunicipality(): string {
  const row = lineProjects().find((r) => r.ine_codes !== "");
  if (!row) throw new Error("no evacuation-line project with a municipality in projects.csv");
  return row.ine_codes.split(";")[0];
}

test("municipality page shows heading, totals and gazette links", async ({ page }) => {
  await page.goto("/municipio/29084");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ronda");
  await expect(page.getByText("INE 29084")).toBeVisible();
  await expect(page.getByTestId("dateline").first()).toContainText("Datos a");
  await expect(page.getByRole("region", { name: "Sensibilidad ambiental" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Red Natura 2000" })).toBeVisible();
});

test("a municipality with projects links every document to the gazette", async ({ page }) => {
  await page.goto("/municipio/11020");
  const links = page.locator("a[href^='https://www.boe.es/']");
  expect(await links.count()).toBeGreaterThan(0);
  await expect(page.getByRole("region", { name: "Totales" })).toBeVisible();
});

test("unknown INE is a 404", async ({ page }) => {
  const response = await page.goto("/municipio/00000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Volver al mapa" })).toBeVisible();
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/municipio/11020");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("each project record links to its project page", async ({ page }) => {
  await page.goto("/municipio/11020");
  const link = page.locator("a[href^='/proyecto/']").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/proyecto\/\d+$/);
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
});

test("totals state MW coverage and that line capacity is not summed", async ({ page }) => {
  await page.goto(`/municipio/${firstLineMunicipality()}`);
  await expect(page.getByText(/MW declarados en \d+ de \d+ proyectos?/)).toBeVisible();
  await expect(page.getByText(/potencia no sumada \(ya contada en las plantas que evacúa\)/)).toBeVisible();
});

test("gazette links name the document, with its reference after the link", async ({ page }) => {
  await page.goto("/municipio/11021");
  const docs = page.locator('li:has(a[href*="boe.es"]), li:has(a[href*="juntadeandalucia.es"])');
  await expect(docs.first()).toBeVisible();
  for (const name of await docs.getByRole("link").allTextContents()) {
    expect(name.trim()).not.toMatch(/^(disposition\.|BOE-)/);
  }
  await expect(docs.first()).toContainText(/(BOE|BOJA) \S+/);
});

test("a municipality with several possible-splitting groups has one section that explains them once", async ({ page }) => {
  const groups: { family: string; mw_total: number; ine_codes: string[] }[] = JSON.parse(
    readFileSync(path.join(__dirname, "..", "public", "data", "splitting_candidates.json"), "utf-8"),
  );
  const count = new Map<string, number>();
  for (const g of groups) for (const ine of g.ine_codes) count.set(ine, (count.get(ine) ?? 0) + 1);
  const [ine, n] = [...count].sort((a, b) => b[1] - a[1])[0];
  expect(n).toBeGreaterThan(1);
  await page.goto(`/municipio/${ine}`);
  const note = page.getByTestId("fraccionamiento");
  await expect(note).toHaveCount(1);
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(note.getByRole("heading", { level: 2 })).toHaveText(`Posible fraccionamiento (${n} grupos)`);
  await expect(note.getByText("Es un patrón en los datos, no una conclusión")).toHaveCount(1);
  await expect(note.getByTestId("fraccionamiento-grupo")).toHaveCount(n);
  // Each group's list is labelled by its family and total MW.
  for (const list of await note.getByRole("list").all()) await expect(list).toHaveAccessibleName(/ · \d[\d.]*(,\d)? MW/);
});

test("plants of different companies behind one shared evacuation project are a group", async ({ page }) => {
  // Carmona: Almazara, Atlante, Chapitel, Garita and Fortaleza Solar, 36,3 MW each, listed by one
  // shared evacuation project; their developers have five different names (data of 2026-10-05).
  await page.goto("/municipio/41024");
  const note = page.getByTestId("fraccionamiento");
  const shared = note.locator('[data-kind="infraestructura"]');
  await expect(shared.first()).toBeVisible();
  const five = shared.filter({ hasText: "Almazara" });
  await expect(five.getByRole("heading", { level: 3 })).toHaveText(/^Misma infraestructura de evacuación · 181,5 MW/);
  for (const id of [275, 276, 281, 283, 294]) await expect(five.locator(`a[href="/proyecto/${id}"]`)).toBeVisible();
  await expect(five.getByTestId("fraccionamiento-infraestructura").getByRole("link")).toHaveAttribute("href", "/proyecto/147");
  await expect(note.getByText("Es un patrón en los datos, no una conclusión")).toHaveCount(1);
});

test("a status row with no declared figure reads sin dato, and hectares carry a coverage line", async ({ page }) => {
  // 04035: its one project is a consultation with no resolution and declares neither MW nor surface (data of 2026-10-05).
  await page.goto("/municipio/04035");
  const totals = page.getByRole("region", { name: "Totales" });
  const row = totals.getByRole("row", { name: /^Consulta sin resolución/ });
  await expect(row.getByRole("cell")).toHaveText(["1", "sin dato", "sin dato"]);
  await expect(totals.getByText(/^MW declarados en \d+ de \d+ proyectos?/)).toBeVisible();
  await expect(totals.getByText(/^Superficie declarada en \d+ de \d+ proyectos?$/)).toBeVisible();
});

type Cell = { status: string; project_count: number; mw_best: number };
const stats: Record<string, { cells: Cell[] }> = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "municipality_stats.json"), "utf-8"));
const ACCUMULATING = ["favorable", "favorable_condicionada", "en_consulta", "sin_resolucion", "desconocido"];
const REFUSED = ["desfavorable", "caducado"];
const sum = (ine: string, statuses: string[], key: "project_count" | "mw_best") =>
  stats[ine]!.cells.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c[key], 0);
const mwText = (n: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: true }).format(n);

test("the Total row counts approved or pending projects only; refused ones have a row of their own", async ({ page }) => {
  // Jerez de la Frontera has refused MW that the old Total added in.
  const ine = "11020";
  expect(sum(ine, REFUSED, "mw_best")).toBeGreaterThan(0);
  await page.goto(`/municipio/${ine}`);
  const totals = page.getByRole("region", { name: "Totales" });
  const total = totals.getByRole("row", { name: /^Total aprobados o en trámite/ });
  await expect(total.getByRole("cell").nth(0)).toHaveText(String(sum(ine, ACCUMULATING, "project_count")));
  await expect(total.getByRole("cell").nth(1)).toHaveText(mwText(sum(ine, ACCUMULATING, "mw_best")));
  const refused = totals.getByTestId("fila-denegados").getByRole("row", { name: /^Denegados o caducados/ });
  await expect(refused.getByRole("cell").nth(0)).toHaveText(String(sum(ine, REFUSED, "project_count")));
  await expect(refused.getByRole("cell").nth(1)).toHaveText(mwText(sum(ine, REFUSED, "mw_best")));
  // No status row is a refused one, and the page states one denominator.
  await expect(totals.getByRole("row", { name: /^Desfavorable/ })).toHaveCount(0);
  await expect(totals.getByTestId("nota-base-municipio")).toContainText(`${sum(ine, ACCUMULATING, "project_count")} proyectos aprobados o en trámite`);
  await expect(totals.getByText(/^MW declarados en \d+ de \d+ proyectos/)).toContainText(`de ${sum(ine, ACCUMULATING, "project_count")} proyectos`);
});
