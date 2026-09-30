import { expect, test } from "@playwright/test";

test("map renders every municipality from the light geojson and the date line", async ({ page }) => {
  const geojson = page.waitForResponse((r) => r.url().endsWith("/data/municipalities_map.geojson") && r.ok());
  await page.goto("/");
  await geojson;
  await expect(page.getByTestId("dateline").first()).toContainText("Datos a");
  await expect(page.locator("path[data-ine]")).toHaveCount(785);
});

test("the page says what it is above the controls", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  await expect(h1).toContainText("impacto acumulado");
  const dek = h1.locator("xpath=following-sibling::p[1]");
  await expect(dek).toContainText("BOE y el BOJA");
  await expect(dek).toContainText(/[\d.]+,\d MW \(MW declarados en [\d.]+ de [\d.]+ proyectos\)/);
  const dekBox = await dek.boundingBox();
  const controlsBox = await page.getByLabel("Hectáreas").boundingBox();
  expect(dekBox!.y).toBeLessThan(controlsBox!.y);
});

test("the map key explains that a multi-municipality project counts in each", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Leyenda del mapa" })).toContainText("Un proyecto en varios municipios cuenta en cada uno");
});

test("switching metric updates the legend and the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Hectáreas").check();
  await expect(page).toHaveURL(/metrica=ha/);
  await expect(page.getByRole("list", { name: "Leyenda" })).toContainText("ha");
});

test("clicking a municipality opens the panel with a link to its page", async ({ page }) => {
  await page.goto("/");
  await page.locator("path[data-ine='11020']").waitFor();
  await page.locator("path[data-ine='11020']").dispatchEvent("click");
  await expect(page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" })).toBeVisible();
  await page.getByRole("link", { name: "Ver municipio" }).click();
  await expect(page).toHaveURL(/\/municipio\/11020$/);
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("technology filter updates the legend coverage and the URL", async ({ page }) => {
  await page.goto("/");
  const coverage = page.getByTestId("cobertura-mapa");
  await expect(coverage).toHaveText(/^MW declarados en [\d.]+ de [\d.]+ proyectos$/);
  const before = await coverage.textContent();
  await page.getByRole("checkbox", { name: "Solar fotovoltaica", exact: true }).uncheck();
  await expect(page).toHaveURL(/tecnologia=/);
  await expect(coverage).not.toHaveText(before ?? "");
});

test("coverage line only shows for MW", async ({ page }) => {
  await page.goto("/?metrica=proyectos");
  await expect(page.getByTestId("cobertura-mapa")).toHaveCount(0);
});

test("with no technology selected the legend says so", async ({ page }) => {
  await page.goto("/?tecnologia=");
  await expect(page.getByRole("complementary", { name: "Leyenda del mapa" }).getByText("Ninguna tecnología seleccionada.")).toBeVisible();
  await expect(page.getByTestId("cobertura-mapa")).toHaveCount(0);
});

test("the panel names the active technology filter below the municipality name", async ({ page }) => {
  await page.goto("/?tecnologia=solar_fv&m=11020");
  const filter = page.getByText("Filtrado por tecnología: Solar fotovoltaica");
  await expect(filter).toBeVisible();
  const heading = await page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" }).boundingBox();
  expect((await filter.boundingBox())!.y).toBeGreaterThan(heading!.y);
});

test("the panel total uses the singular for one project", async ({ page }) => {
  await page.goto("/?tecnologia=solar_fv&m=18051");
  const total = page.getByRole("complementary", { name: "Municipio seleccionado" }).locator("dd").last();
  await expect(total).toContainText("1 proyecto");
  await expect(total).not.toContainText("proyectos");
});

test("the legend stays visible while a municipality is selected", async ({ page }) => {
  await page.goto("/?m=11020");
  const panel = page.getByRole("complementary", { name: "Municipio seleccionado" });
  await expect(panel.getByRole("heading", { level: 2, name: "Jerez de la Frontera" })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Leyenda" })).toBeVisible();
  await expect(panel.getByTestId("cobertura-mapa")).toBeVisible();
});

test("the panel distinguishes no projects from no projects under these filters", async ({ page }) => {
  await page.goto("/?estado=&m=11020");
  const panel = page.getByRole("complementary", { name: "Municipio seleccionado" });
  await expect(panel.getByText("Ningún proyecto con estos filtros.")).toBeVisible();
  await expect(panel.getByText("Ningún proyecto registrado en los boletines desde 2019.")).toHaveCount(0);
});

test("with hectares, the panel states how many projects declare a surface", async ({ page }) => {
  await page.goto("/?metrica=ha&m=11020");
  const panel = page.getByRole("complementary", { name: "Municipio seleccionado" });
  await expect(panel.getByText(/^Superficie declarada en [\d.]+ de [\d.]+ proyectos?$/)).toBeVisible();
  await expect(panel.getByText(/MW declarados en/)).toHaveCount(0);
});

test("the panel never shows a zero sum for a status whose projects declare no figure", async ({ page }) => {
  await page.goto("/?m=11020");
  const rows = page.getByRole("complementary", { name: "Municipio seleccionado" }).getByRole("definition");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) {
    expect(text).not.toMatch(/(^|· )0,0 (MW|ha)/);
  }
});

test("on a phone the filters fold behind a toggle that summarises them", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("resumen-filtros")).toHaveText("Todos los estados · Todas las tecnologías");
  await expect(page.getByRole("checkbox", { name: "Favorable", exact: true })).toBeHidden();
  await toggle.click();
  await page.getByRole("checkbox", { name: "Favorable", exact: true }).uncheck();
  await expect(page.getByTestId("resumen-filtros")).toHaveText("5 de 6 estados · Todas las tecnologías");
});

test("status and technology shortcuts select all or none in one click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Desmarcar todos: estados", exact: true }).click();
  await expect(page).toHaveURL(/estado=(&|$)/);
  await expect(page.getByRole("region", { name: "Por provincia" }).getByText("Ningún estado seleccionado.")).toBeVisible();
  await page.getByRole("button", { name: "Marcar todos: estados", exact: true }).click();
  await expect(page).not.toHaveURL(/estado=/);
  await page.getByRole("button", { name: "Desmarcar todos: tecnologías", exact: true }).click();
  await expect(page.getByRole("region", { name: "Por provincia" }).getByText("Ninguna tecnología seleccionada.")).toBeVisible();
});
