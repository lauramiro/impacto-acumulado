import { expect, test } from "@playwright/test";

test("the Natura 2000 table lists every site and finds one by name", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await expect(section.getByTestId("natura-recuento")).toHaveText("197 espacios");
  await expect(section.getByText("Mide cercanía a escala municipal, no afección al espacio.")).toBeVisible();
  await section.getByLabel("Buscar espacio").fill("donana");
  await expect(section.getByRole("row", { name: /Doñana/ }).first()).toBeVisible();
});

test("the Natura 2000 table follows the filters", async ({ page }) => {
  await page.goto("/?metrica=proyectos");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await section.getByLabel("Buscar espacio").fill("donana");
  const row = section.getByRole("row", { name: /Doñana/ }).first();
  const before = await row.textContent();
  await page.getByRole("checkbox", { name: /^Favorable con condiciones \(/ }).uncheck();
  await expect(row).not.toHaveText(before ?? "");
});

test("with no technology selected the index and the Natura table say so", async ({ page }) => {
  await page.goto("/?tecnologia=");
  const indice = page.getByRole("region", { name: "Índice de municipios" });
  const natura = page.getByRole("region", { name: "Red Natura 2000" });
  await expect(indice.getByText("Ninguna tecnología seleccionada.")).toBeVisible();
  await expect(natura.getByText("Ninguna tecnología seleccionada.")).toBeVisible();
  await expect(indice.getByText("Ningún municipio coincide con la búsqueda.")).toHaveCount(0);
});

test("with MW, the index and the Natura table state how many projects declare it", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Índice de municipios", "Red Natura 2000"]) {
    await expect(page.getByRole("region", { name }).getByRole("columnheader", { name: "Con MW declarado" })).toBeVisible();
  }
  await page.goto("/?metrica=ha");
  for (const name of ["Índice de municipios", "Red Natura 2000"]) {
    await expect(page.getByRole("region", { name }).getByRole("columnheader", { name: "Con MW declarado" })).toHaveCount(0);
  }
});

test("with hectares, the Natura table states how many projects declare a surface", async ({ page }) => {
  await page.goto("/?metrica=ha");
  await expect(page.getByRole("region", { name: "Red Natura 2000" }).getByRole("columnheader", { name: "Con superficie declarada" })).toBeVisible();
});

test("the Natura 2000 table starts with the largest figure and tells sites without projects apart", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await expect(section.getByRole("columnheader", { name: "MW", exact: true })).toHaveAttribute("aria-sort", "descending");
  await expect(section.locator("tbody tr")).toHaveCount(20);
  await section.getByRole("button", { name: /^Ver todos/ }).click();
  await expect(section.getByText("sin proyectos").first()).toBeVisible();
  const withProjects = section.getByRole("row").filter({ hasText: /\d de \d/ }).first();
  await expect(withProjects).not.toContainText("sin proyectos");
});

test("Natura 2000 names are readable and not cut short", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await section.getByLabel("Buscar espacio").fill("ES6110006");
  await expect(section.getByRole("rowheader", { name: "Ramblas de Gergal, Tabernas y Sur de Sierra Alhamilla" })).toBeVisible();
  await expect(section.getByTestId("natura-recuento")).toHaveText("1 de 197 espacios");
});
