import { expect, test } from "@playwright/test";

test("index is searchable and reachable by keyboard", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Buscar municipio");
  await search.fill("jerez");
  const row = page.getByRole("row", { name: /Jerez de la Frontera/ });
  await expect(row).toBeVisible();
  // The sort buttons in the header come first; Tab on to the row's link.
  const link = row.getByRole("link", { name: "Jerez de la Frontera" });
  await search.focus();
  for (let i = 0; i < 10 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/municipio\/11020$/);
});

test("index count follows the status filter", async ({ page }) => {
  await page.goto("/");
  const count = page.getByTestId("indice-recuento");
  const before = await count.textContent();
  await page.getByLabel("Favorable con condiciones").uncheck();
  await expect(count).not.toHaveText(before ?? "");
});

test("the index count reads matches of the total while searching", async ({ page }) => {
  await page.goto("/");
  const count = page.getByTestId("indice-recuento");
  const total = (await count.textContent())?.match(/^[\d.]+/)?.[0];
  await page.getByLabel("Buscar municipio").fill("jerez");
  await expect(count).toHaveText(`1 de ${total} municipios con proyectos`);
});

test("the index shows 20 rows until asked for all, and search covers every row", async ({ page }) => {
  await page.goto("/");
  const index = page.getByRole("region", { name: "Índice de municipios" });
  const rows = index.locator("tbody tr");
  await expect(rows).toHaveCount(20);
  const more = index.getByRole("button", { name: /^Ver todos \(\d+\)$/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const total = Number((await more.textContent())?.match(/\d+/)?.[0]);
  await more.click();
  await expect(rows).toHaveCount(total);
  const last = (await rows.last().locator("th").textContent()) ?? "";
  await index.getByRole("button", { name: "Ver solo los 20 primeros" }).click();
  await expect(rows).toHaveCount(20);
  await expect(index.getByRole("rowheader", { name: last, exact: true })).toHaveCount(0);
  // Search still covers the rows past the first 20.
  await index.getByLabel("Buscar municipio").fill(last);
  await expect(index.getByRole("rowheader", { name: last, exact: true })).toBeVisible();
});

test("the index sorts by a column header and says so with aria-sort", async ({ page }) => {
  await page.goto("/");
  const index = page.getByRole("region", { name: "Índice de municipios" });
  const mw = index.getByRole("columnheader", { name: /^MW/ });
  const name = index.getByRole("columnheader", { name: /^Municipio/ });
  await expect(mw).toHaveAttribute("aria-sort", "descending");
  await expect(name).not.toHaveAttribute("aria-sort", /.*/);
  await name.getByRole("button").click();
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  await expect(mw).not.toHaveAttribute("aria-sort", /.*/);
  const names = await index.locator("tbody th").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
  await name.getByRole("button").click();
  await expect(name).toHaveAttribute("aria-sort", "descending");
});

test("with no status or no technology the index shows the notice, not a zero count", async ({ page }) => {
  const index = page.getByRole("region", { name: "Índice de municipios" });
  await page.goto("/?estado=");
  await expect(index.getByText("Ningún estado seleccionado.")).toBeVisible();
  await expect(page.getByTestId("indice-recuento")).toBeEmpty();
  await page.goto("/?tecnologia=");
  await expect(index.getByText("Ninguna tecnología seleccionada.")).toBeVisible();
  await expect(page.getByTestId("indice-recuento")).toBeEmpty();
});

test("under hectares the index marks undeclared surface as sin dato, with a coverage column", async ({ page }) => {
  await page.goto("/?metrica=ha");
  const index = page.getByRole("region", { name: "Índice de municipios" });
  await expect(index.getByRole("columnheader", { name: /^Con superficie declarada/ })).toBeVisible();
  const more = index.getByRole("button", { name: /^Ver todos \(\d+\)$/ });
  const total = Number((await more.textContent())?.match(/\d+/)?.[0]);
  await more.click();
  const rows = index.locator("tbody tr");
  await expect(rows).toHaveCount(total);
  // The third cell is the hectare column (the municipality is the row header).
  const cells = (await rows.locator(":scope > :nth-child(3)").allTextContents()).map((c) => c.trim());
  expect(cells).not.toContain("0,0 ha");
  const firstNoData = cells.indexOf("sin dato");
  expect(firstNoData).toBeGreaterThan(0);
  // Rows with a figure come before rows without one.
  expect(cells.slice(firstNoData).every((c) => c === "sin dato")).toBe(true);
});
