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
