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

test("a developer page shows the possible-splitting groups of its family", async ({ page }) => {
  const groups: { family: string; project_ids: number[] }[] = JSON.parse(
    readFileSync(path.join(__dirname, "..", "public", "data", "splitting_candidates.json"), "utf-8"),
  );
  const tayant = developers.find((d) => d.key === "tayant-investment-12")!;
  const mine = groups.filter((g) => g.family === tayant.family);
  expect(mine.length).toBeGreaterThan(0);
  await page.goto("/promotor/tayant-investment-12");
  const note = page.getByTestId("fraccionamiento");
  await expect(note).toHaveCount(1);
  await expect(note.getByTestId("fraccionamiento-grupo")).toHaveCount(mine.length);
  for (const id of mine[0].project_ids) await expect(note.locator(`a[href="/proyecto/${id}"]`)).toBeVisible();

  const none = developers.find((d) => !groups.some((g) => g.family === d.family))!;
  await page.goto(`/promotor/${none.key}`);
  await expect(page.getByTestId("fraccionamiento")).toHaveCount(0);
});

test("the MW column tells no approved projects from undeclared MW, and ranks both last", async ({ page }) => {
  await page.goto("/promotores");
  const section = page.getByRole("region", { name: "Todos los promotores" });
  const search = section.getByLabel("Buscar promotor");
  // Its only project lapsed: nothing approved or pending, so no MW to be missing.
  await search.fill("Arena Power Ren 32");
  await expect(section.getByRole("row", { name: /Arena Power Ren 32/ }).getByRole("cell").first()).toHaveText("1");
  await expect(section.getByRole("row", { name: /Arena Power Ren 32/ }).getByRole("cell").nth(1)).toContainText("–");
  await search.fill("");
  const mw = section.getByRole("button", { name: /MW aprobados o en trámite/ });
  const firstMw = section.locator("tbody tr").first().getByRole("cell").nth(1);
  await mw.click();
  await expect(firstMw).toHaveText(/^[\d.,]+ MW$/);
  await mw.click();
  await expect(section.getByRole("columnheader", { name: /MW aprobados/ })).toHaveAttribute("aria-sort", "ascending");
  await expect(firstMw).toHaveText(/^[\d.,]+ MW$/);
});
