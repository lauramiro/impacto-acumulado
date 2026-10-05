import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { expect, test } from "@playwright/test";

const projects: { status: string; provinces: string }[] = parse(readFileSync(path.join(__dirname, "..", "public", "data", "projects.csv"), "utf-8"), {
  columns: true,
  bom: true,
});

test("refusal rates give their cases, counted from projects.csv", async ({ page }) => {
  const decided = projects.filter((p) => ["favorable", "favorable_condicionada", "desfavorable"].includes(p.status));
  const refused = decided.filter((p) => p.status === "desfavorable").length;
  await page.goto("/resultados");
  const table = page.getByRole("table", { name: "Denegaciones y plazo por provincia" });
  await expect(table.getByRole("row", { name: /^Andalucía/ })).toContainText(`${refused} de ${decided.length}`);
  for (const prov of ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"]) {
    const n = decided.filter((p) => p.provinces.split("; ").includes(prov)).length;
    const row = table.getByRole("row", { name: new RegExp(`^${prov}`) });
    if (n < 10) await expect(row).toContainText("pocos casos");
    else await expect(row).toContainText("%");
  }
  await expect(page.getByRole("table", { name: "Denegaciones por tecnología" })).toBeVisible();
});

test("a median under the minimum sample reads as few cases, with its count", async ({ page }) => {
  await page.goto("/resultados");
  await expect(page.getByText(/por debajo de 10 proyectos medidos/)).toBeVisible();
  const rows = page.getByRole("table", { name: "Denegaciones y plazo por provincia" }).locator("tbody tr");
  await expect(rows).toHaveCount(9);
  for (const cell of await rows.locator("td:last-child").allInnerTexts()) {
    const few = cell.match(/^pocos casos \((\d+)\)$/);
    if (few) expect(Number(few[1])).toBeLessThan(10);
    else expect(Number(cell.match(/\((\d+)\)$/)?.[1])).toBeGreaterThanOrEqual(10);
  }
});

test("only the home page asks for the map files", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => /geojson/.test(r.url()) && requested.push(r.url()));
  await page.goto("/resultados");
  await expect(page.locator("link[rel=preload][href*='geojson']")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(requested).toEqual([]);
  await page.goto("/");
  await expect(page.locator("link[rel=preload][href*='municipalities_map.geojson']")).toHaveCount(1);
});
