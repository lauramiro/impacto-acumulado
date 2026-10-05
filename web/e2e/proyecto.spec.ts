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

test("an evacuation line's capacity is labelled as evacuated", async ({ page }) => {
  await page.goto(`/proyecto/${lineProjects()[0].id}`);
  await expect(page.getByText("Potencia evacuada", { exact: true })).toBeVisible();
  await expect(page.getByText("Potencia nominal", { exact: true })).toHaveCount(0);
});

type Details = Record<string, { document_id: number; conditions: { category: string; text: string }[]; species_mentioned: string[]; evidence: Record<string, string> }[]>;
const details: Details = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "project_details.json"), "utf-8"));

test("project 1 shows its conditions by category, each tied to a document, and a quote behind its capacity", async ({ page }) => {
  const conditions = details["1"]!.flatMap((d) => d.conditions);
  await page.goto("/proyecto/1");
  await expect(page.getByRole("heading", { name: `Condiciones (${conditions.length})` })).toBeVisible();
  await expect(page.getByText("Resumen automático de las condiciones")).toBeVisible();
  const first = conditions[0]!;
  const item = page.getByRole("listitem").filter({ hasText: first.text }).first();
  await item.getByRole("link").click();
  await expect(page).toHaveURL(/#documento-\d+$/);
  const ficha = page.getByRole("region", { name: "Ficha" });
  await ficha.getByText("Cita").first().click();
  await expect(ficha.locator("details[open] li").first()).toContainText("«");
});

test("species named in the documents are listed, with a caution", async ({ page }) => {
  const id = Object.keys(details).find((k) => details[k]!.some((d) => d.species_mentioned.length > 0))!;
  await page.goto(`/proyecto/${id}`);
  const region = page.getByRole("region", { name: "Especies y espacios citados" });
  await expect(region).toContainText("Citar no quiere decir que el proyecto los afecte");
});

test("documents lead with what they are and who issued them; a correction says so", async ({ page }) => {
  const rows: { id: string; project_id: string; title: string }[] = parse(
    readFileSync(path.join(__dirname, "..", "public", "data", "documents.csv"), "utf-8"),
    { columns: true, bom: true },
  );
  const correction = rows.find((r) => /correcci[oó]n de errores/i.test(r.title) && r.project_id !== "")!;
  await page.goto(`/proyecto/${correction.project_id}`);
  const item = page.locator(`#documento-${correction.id}`);
  await expect(item.getByTestId("correccion")).toBeVisible();
  await expect(item.locator("p").first()).toContainText("Corrección de errores");
  await page.goto("/proyecto/1");
  await expect(page.getByRole("region", { name: /Documentos/ }).getByText(/Dirección General|Subdelegación|Delegación/).first()).toBeVisible();
});

test("a project in a possible-splitting group says so, neutrally, and links its siblings", async ({ page }) => {
  const groups: { family: string; project_ids: number[] }[] = JSON.parse(
    readFileSync(path.join(__dirname, "..", "public", "data", "splitting_candidates.json"), "utf-8"),
  );
  const tayant = groups.find((g) => g.family === "tayant-investment")!;
  await page.goto(`/proyecto/${tayant.project_ids[0]}`);
  const note = page.getByTestId("fraccionamiento");
  await expect(note).toContainText("Es un patrón en los datos, no una conclusión");
  await expect(note.getByRole("link")).toHaveCount(tayant.project_ids.length);
});
