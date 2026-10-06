import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

type Cell = { status: string; mw_best: number };
const region: Cell[] = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "province_stats.json"), "utf-8"))["Andalucía"].cells;
const mw = (statuses: string[]) => {
  const sum = region.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c.mw_best, 0);
  // The site forces grouping (es-ES alone writes "2022,9"): see web/src/lib/format.ts.
  return `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: true }).format(sum)} MW`;
};

test("the headline never sums refused projects with the rest, and states both against province_stats.json", async ({ page }) => {
  await page.goto("/");
  // Projects whose notice states no verdict are given apart, not summed with the approved or pending.
  await expect(page.getByTestId("mw-acumulando")).toHaveText(mw(["favorable", "favorable_condicionada", "en_consulta", "sin_resolucion"]));
  await expect(page.getByTestId("mw-sin-veredicto")).toHaveText(mw(["desconocido"]));
  await expect(page.getByTestId("mw-denegados")).toHaveText(mw(["desfavorable", "caducado"]));
  await expect(page.getByText(/con \S+ y \S+ a la cabeza\. Sin veredicto en el boletín:/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sin veredicto en el boletín" })).toHaveAttribute("href", "/metodologia#sin-veredicto");
});

test("MW per km² colours the map and sorts the municipality index", async ({ page }) => {
  await page.goto("/?metrica=densidad");
  await expect(page.getByRole("radio", { name: "MW por km²" })).toBeChecked();
  const index = page.getByRole("region", { name: /Índice de municipios/ });
  const header = index.getByRole("columnheader", { name: /MW por km²/ });
  await expect(header).toHaveAttribute("aria-sort", "descending");
  const first = index.getByRole("row").nth(1);
  await expect(first).toContainText(/\d,\d\d MW\/km²/);
  // The map's <title> elements also say MW/km² and are never visible: look at the visible matches.
  await expect(page.getByText(/MW\/km²/).locator("visible=true").first()).toBeVisible();
  // The Natura table has no area of its own and says it shows MW instead.
  await expect(page.getByText(/Con «MW por km²» la tabla muestra MW/)).toBeVisible();
});

test("a municipality page states the share of its area the declared hectares cover", async ({ page }) => {
  await page.goto("/municipio/11021");
  await expect(page.getByTestId("cuota-termino")).toContainText(/Superficie declarada: [\d.,]+ ha, el [\d.,]+ % del término municipal/);
  await expect(page.getByTestId("cuota-termino")).toContainText(/\(superficie declarada en \d+ de \d+ proyectos\)/);
});
