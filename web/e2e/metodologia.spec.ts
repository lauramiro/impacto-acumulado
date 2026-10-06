import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

test("methodology page publishes per-field accuracy with its sample size", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Metodología");
  const table = page.getByRole("table", { name: "Precisión por campo" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  // evaluation.json currently scores 11 fields; a hardcoded table, a dropped
  // field or stale figures must fail this, not just an emptied-out table.
  await expect(rows).toHaveCount(11);
  // The held-out figure, with the September one beside it as history.
  await expect(table.getByRole("row", { name: /Nombre del proyecto/ })).toContainText("89 %");
  await expect(table.getByRole("row", { name: /Nombre del proyecto/ })).toContainText("40 %");
  await expect(table.getByRole("columnheader", { name: "22 de septiembre de 2026" })).toBeVisible();
  await expect(page.getByTestId("muestra")).toContainText(/Medida el 5 de octubre de 2026 con .*mistral.* sobre 20 documentos/);
  await expect(page.getByTestId("muestra")).toContainText("ninguno de esos documentos se usó para ajustar el extractor");
  await expect(page.getByTestId("medida-anterior")).toContainText("ya no mide la versión publicada");
  await expect(page.getByRole("link", { name: /etiquetas/ })).toHaveAttribute("href", /github\.com\/.*labels_2026-10/);
  // Each share carries its Wilson interval, from evaluation.json.
  const ev = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "evaluation.json"), "utf-8"));
  const nominal = ev.intervals.mw_nominal;
  await expect(table.getByRole("columnheader", { name: "Intervalo del 95 %" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Potencia nominal/ })).toContainText(
    `${Math.round(nominal.low * 100)} a ${Math.round(nominal.high * 100)} %`,
  );
  await expect(page.getByTestId("intervalo")).toContainText("Wilson al 95 %");
});

test("methodology reports the BOJA coverage against the search's total_hits", async ({ page }) => {
  const meta = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "meta.json"), "utf-8"));
  const c = meta.boja_coverage;
  const n = (x: number) => new Intl.NumberFormat("es-ES", { useGrouping: true }).format(x);
  await page.goto("/metodologia");
  const line = page.getByTestId("cobertura-boja");
  await expect(line).toContainText(`da ${n(c.total_hits)} resultados`);
  await expect(line).toContainText(`quedan ${n(c.selected)} anuncios, y el sitio tiene ${n(c.stored)}, el ${Math.round((100 * c.stored) / c.selected)} %`);
  await expect(page.getByRole("table", { name: "Cobertura del BOJA por año" })).toBeVisible();
  await expect(page.getByTestId("no-cubre-energia")).toContainText("consejería con competencias en energía");
});

test("methodology explains the slice 3 aggregation rules", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByText(/no suma la potencia de las líneas de evacuación/)).toBeVisible();
  await expect(page.getByText(/Cada total de MW indica cuántos proyectos la declaran/)).toBeVisible();
  await expect(page.getByText(/solo declara la potencia pico/)).toBeVisible();
  await expect(page.getByText(/malla de 250 m/)).toBeVisible();
});

test("the early-record caveat counts 2019 to 2021 from documents.csv", async ({ page }) => {
  const rows: { source: string; published_at: string }[] = parse(
    readFileSync(path.join(__dirname, "..", "public", "data", "documents.csv"), "utf-8"),
    { columns: true, bom: true },
  );
  const early = rows.filter((r) => r.published_at < "2022");
  const boja = early.filter((r) => r.source === "boja").length;
  const boe = early.filter((r) => r.source === "boe").length;
  await page.goto("/metodologia");
  await expect(page.getByTestId("registro-temprano")).toContainText(`${boja} documentos del BOJA y ${boe} del BOE de 2019 a 2021`);
  await expect(page.getByText(/el extractor aún no los distingue/)).toHaveCount(0);
});

test("the page does not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/metodologia");
  await expect(page.getByRole("columnheader", { name: "22 de septiembre de 2026" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
