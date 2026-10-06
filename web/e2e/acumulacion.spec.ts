import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { expect, test } from "@playwright/test";

test("the running total ends on the totals table's figure and lists each project it adds", async ({ page }) => {
  await page.goto("/municipio/41024");
  const totals = page.getByRole("region", { name: "Totales" });
  const totalRow = totals.getByRole("row", { name: /^Total aprobados o en trámite/ });
  const [projects, mw] = await totalRow.getByRole("cell").allInnerTexts();

  const chart = page.getByRole("region", { name: "Cómo se ha acumulado" });
  await expect(chart.getByTestId("grafico-acumulacion")).toBeVisible();
  await expect(chart.locator("p").first()).toContainText(`${mw} MW en ${projects} proyectos aprobados o en trámite`);

  await chart.getByText("Ver los datos").click();
  const rows = chart.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(Number(projects));
  await expect(rows.last().getByRole("cell").last()).toHaveText(mw!);
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/proyecto\/\d+$/);
});

test("a municipality whose projects declare no MW gets a sentence, not a flat chart", async ({ page }) => {
  // 04035: one consultation with no resolution, declaring no MW (data of 2026-10-05).
  await page.goto("/municipio/04035");
  const chart = page.getByRole("region", { name: "Cómo se ha acumulado" });
  await expect(chart).toContainText("sin MW declarado");
  await expect(chart.getByTestId("grafico-acumulacion")).toHaveCount(0);
});

test("for every municipality, the projects the chart adds match the totals' count and MW", () => {
  // A data check, no page: the chart reads projects.csv, the totals read municipality_stats.json.
  const DATA = path.join(__dirname, "..", "public", "data");
  const ACCUMULATING = ["favorable", "favorable_condicionada", "en_consulta", "sin_resolucion"];
  const rows: Record<string, string>[] = parse(readFileSync(path.join(DATA, "projects.csv"), "utf-8"), { columns: true });
  const stats: Record<string, { cells: { status: string; project_count: number; mw_best: number }[] }> = JSON.parse(readFileSync(path.join(DATA, "municipality_stats.json"), "utf-8"));
  const mismatches: string[] = [];
  for (const [ine, s] of Object.entries(stats)) {
    const cells = s.cells.filter((c) => ACCUMULATING.includes(c.status));
    const expected = { count: cells.reduce((a, c) => a + c.project_count, 0), mw: cells.reduce((a, c) => a + c.mw_best, 0) };
    const here = rows.filter((r) => ACCUMULATING.includes(r.status!) && r.ine_codes!.split(";").includes(ine));
    // An evacuation line counts as a project with no MW, as in the totals.
    const mw = here.reduce((a, r) => a + (r.technology === "linea_evacuacion" ? 0 : Number(r.mw_nominal || r.mw_peak || 0)), 0);
    if (here.length !== expected.count || Math.abs(mw - expected.mw) > 0.05) mismatches.push(`${ine}: ${here.length}/${expected.count} projects, ${mw.toFixed(1)}/${expected.mw.toFixed(1)} MW`);
  }
  expect(mismatches).toEqual([]);
});
