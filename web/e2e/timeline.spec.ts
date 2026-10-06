import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openFilters } from "./filters";

test("timeline title follows province and technology, and the data table opens", async ({ page }) => {
  await page.goto("/");
  await openFilters(page);
  const section = page.getByRole("region", { name: /Documentos por mes/ });
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Documentos por mes · Andalucía");
  const rows: { published_at: string }[] = parse(readFileSync(path.join(__dirname, "..", "public", "data", "documents.csv"), "utf-8"), { columns: true, bom: true });
  const early = rows.filter((r) => r.published_at < "2022").length;
  await expect(section.getByText(`la colección solo contiene ${early.toLocaleString("es-ES")} documentos; la serie empieza en 2022.`)).toBeVisible();
  await expect(section.getByText("solo contiene 5 documentos")).toHaveCount(0);
  await page.getByRole("region", { name: "Por provincia" }).getByRole("button", { name: "Sevilla" }).click();
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Documentos por mes · Provincia de Sevilla");
  await page.getByRole("checkbox", { name: "Eólica", exact: true }).uncheck();
  await expect(section.getByRole("heading", { level: 2 })).toContainText("Solar fotovoltaica");
  await section.getByText("Ver los datos").click();
  await expect(section.getByRole("table", { name: "Por año" }).getByRole("columnheader", { name: "Sin veredicto en el boletín" })).toBeVisible();
  await section.getByRole("button", { name: "Toda Andalucía" }).click();
  await expect(page).not.toHaveURL(/provincia=/);
});

test("the timeline summary does not collide with the status filter label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Favorable con condiciones")).toHaveCount(1);
});

test("timeline empty state", async ({ page }) => {
  await page.goto("/?tecnologia=");
  await expect(page.getByRole("region", { name: /Documentos por mes/ }).getByText("Ningún documento con estos filtros.")).toBeVisible();
});

test("timeline leaves out empty rows and says the status filter does not apply", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: /Documentos por mes/ });
  await expect(section.getByText(/el filtro de estado no se aplica/)).toBeVisible();
  await expect(section.getByText(/Sin documentos con esta selección: Favorable\./)).toBeVisible();
  await section.getByText("Ver los datos").click();
  const yearly = section.getByRole("table", { name: "Por año" });
  await expect(yearly.getByRole("columnheader", { name: "Favorable con condiciones" })).toBeVisible();
  await expect(section.getByRole("columnheader", { name: "Favorable", exact: true })).toHaveCount(0);
});

test("the dateline counts documents, not resolutions", async ({ page }) => {
  await page.goto("/");
  const dateline = page.getByTestId("dateline").first();
  await expect(dateline).toContainText(/\d documentos/);
  await expect(dateline).not.toContainText("resoluciones");
});

test("the dateline gives the newest document beside the export date", async ({ page }) => {
  const meta = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "meta.json"), "utf-8"));
  const day = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${meta.last_document}T00:00:00Z`));
  await page.goto("/");
  await expect(page.getByTestId("dateline").first()).toContainText(`(último documento: ${day})`);
});

test("monthly counts are in the data table and fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const section = page.getByRole("region", { name: /Documentos por mes/ });
  await section.getByText("Ver los datos").click();
  const monthly = section.getByRole("table", { name: "Por mes" });
  const row = monthly.getByRole("row", { name: /marzo de 2023/ });
  await expect(row.getByRole("rowheader")).toHaveAccessibleName("marzo de 2023");
  await expect(row.getByRole("cell").first()).toHaveText(/^\d+$/);
  const fits = await monthly.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
});
