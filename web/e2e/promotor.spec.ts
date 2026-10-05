import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

type Dev = { key: string; name: string; names: string[]; family: string; project_ids: number[] };
const developers: Dev[] = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "developers.json"), "utf-8"));

test("printings of one company share a page that lists them", async ({ page }) => {
  const enel = developers.find((d) => d.key === "enel-green-power-espana")!;
  expect(enel.names).toEqual(expect.arrayContaining(["Enel Green Power España, S.L.", "Enel Green Power España, SL"]));
  await page.goto(`/promotor/${enel.key}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(enel.name);
  await expect(page.getByTestId("otras-grafias")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Proyectos (${enel.project_ids.length})` })).toBeVisible();
  await expect(page.getByText("Aprobados o en trámite:")).toBeVisible();
});

test("sibling companies are shown as a naming pattern, not as a group", async ({ page }) => {
  await page.goto("/promotor/tayant-investment-12");
  const related = page.getByRole("region", { name: "Sociedades con el mismo nombre" });
  await expect(related).toContainText("no está comprobado que pertenezcan al mismo grupo");
  for (const n of [13, 14, 15]) await expect(related.getByRole("link", { name: new RegExp(`Tayant Investment ${n}`) })).toBeVisible();
});

test("a project page links its developer", async ({ page }) => {
  const enel = developers.find((d) => d.key === "enel-green-power-espana")!;
  await page.goto(`/proyecto/${enel.project_ids[0]}`);
  await page.getByRole("link", { name: /^Enel Green Power España/ }).click();
  await expect(page).toHaveURL(/\/promotor\/enel-green-power-espana$/);
});

test("the index lists every developer and finds one by any printing", async ({ page }) => {
  await page.goto("/promotores");
  const section = page.getByRole("region", { name: "Todos los promotores" });
  await expect(section.getByTestId("promotores-recuento")).toHaveText(`${developers.length} promotores`);
  await section.getByLabel("Buscar promotor").fill("IBERDROLA RENOVABLES ANDALUCIA S.A.");
  await expect(section.getByRole("rowheader")).toHaveCount(1);
});
