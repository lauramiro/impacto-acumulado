import { expect, test } from "@playwright/test";

test("the Natura 2000 table lists every site and finds one by name", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await expect(section.getByTestId("natura-recuento")).toHaveText("197 espacios");
  await expect(section.getByText("Mide cercanía a escala municipal, no afección al espacio.")).toBeVisible();
  await section.getByLabel("Buscar espacio").fill("donana");
  await expect(section.getByRole("row", { name: /DOÑANA/ }).first()).toBeVisible();
});

test("the Natura 2000 table follows the filters", async ({ page }) => {
  await page.goto("/?metrica=proyectos");
  const section = page.getByRole("region", { name: "Red Natura 2000" });
  await section.getByLabel("Buscar espacio").fill("donana");
  const row = section.getByRole("row", { name: /DOÑANA/ }).first();
  const before = await row.textContent();
  await page.getByRole("checkbox", { name: "Favorable con condiciones", exact: true }).uncheck();
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
