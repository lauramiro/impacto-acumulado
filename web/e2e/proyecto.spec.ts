import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { expect, test } from "@playwright/test";

// Finds a real "desconocido" project id from the live export rather than
// hardcoding one: status_document_id still names a real document for every
// desconocido project (see web/src/lib/data/project-record.ts), so a test
// pinned to a specific id would stop testing the right thing, not just fail,
// the day that project's status resolves in a weekly run.
function findDesconocidoProjectId(): number {
  const csvPath = path.join(process.cwd(), "public", "data", "projects.csv");
  const text = readFileSync(csvPath, "utf-8");
  const rows: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  const row = rows.find((r) => r["status"] === "desconocido");
  if (!row) throw new Error("no desconocido project found in public/data/projects.csv");
  return Number(row["id"]);
}

test("project page shows the record, the timeline and which document fixed the status", async ({ page }) => {
  await page.goto("/proyecto/1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Las Quinientas");
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Documentos/ })).toBeVisible();
  await expect(page.getByTestId("fija-estado")).toHaveCount(1);
  // agrupado's count reflects how many documents got grouped into this
  // project, which shifts as the weekly workflow commits fresh data to
  // main; pin only that at least one mark is present, not the exact count,
  // so a routine regrouping does not break the weekly run.
  const agrupado = page.getByTestId("agrupado");
  expect(await agrupado.count()).toBeGreaterThan(0);
  await expect(agrupado.first()).toContainText("Agrupado con confianza");
  expect(await page.locator("a[href^='https://www.boe.es/']").count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /Jerez de la Frontera/ })).toHaveAttribute("href", "/municipio/11020");
  await expect(page.getByRole("region", { name: "Cómo se ha construido esta ficha" })).toBeVisible();
  const noAplicaRow = page.locator("li", { hasText: "BOE-A-2020-14181" });
  await expect(noAplicaRow).toContainText("No aplica");
  await expect(noAplicaRow.locator("[data-status]")).toHaveCount(0);
});

test("a desconocido project shows no fija-estado mark and says no document resolved it", async ({ page }) => {
  // status_document_id names a real document even for a desconocido project
  // (derive_status seeds it with the latest document and never clears the
  // seed when nothing resolves the status - see
  // pipeline/impacto/resolve/status.py). The timeline must not mark that
  // document as having fixed the status, and the provenance section must
  // say plainly that nothing resolved it; the two must agree.
  const id = findDesconocidoProjectId();
  await page.goto(`/proyecto/${id}`);
  await expect(page.getByRole("region", { name: "Ficha", exact: true })).toBeVisible();
  await expect(page.getByTestId("fija-estado")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Cómo se ha construido esta ficha" })).toContainText(
    "Ningún documento resuelve el expediente",
  );
});

test("unknown project id is a 404", async ({ page }) => {
  const response = await page.goto("/proyecto/999999");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Volver al mapa" })).toBeVisible();
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/proyecto/1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
