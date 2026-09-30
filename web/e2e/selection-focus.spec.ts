import { expect, test, type Page } from "@playwright/test";

async function verEnElMapa(page: Page) {
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  const index = page.getByRole("region", { name: "Índice de municipios" });
  const row = index.locator("tbody tr").first();
  const name = ((await row.locator("th").textContent()) ?? "").trim();
  const button = row.getByRole("button", { name: "Ver en el mapa" });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  return page.getByRole("heading", { level: 2, name, exact: true });
}

for (const [label, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test(`Ver en el mapa brings the selected municipality into view and focuses it (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const heading = await verEnElMapa(page);
    await expect(page).toHaveURL(/[?&]m=\d+/);
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
  });
}

test("tapping a municipality on a phone scrolls the panel below the map into view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("path[data-ine='11020']").waitFor();
  await page.locator("path[data-ine='11020']").dispatchEvent("click");
  const heading = page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});

test("with reduced motion the scroll to the selection is instant", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const heading = await verEnElMapa(page);
  await expect(heading).toBeFocused();
  // No smooth scroll: the heading is in view as soon as it has focus, without retrying.
  expect(await heading.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  })).toBe(true);
  await context.close();
});

test("loading a URL with a selection does not move the page", async ({ page }) => {
  await page.goto("/?m=11020");
  await expect(page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("skip links are the first tab stops and jump to their sections", async ({ page }) => {
  await page.goto("/");
  const targets = [
    ["Mapa", "mapa"],
    ["Índice de municipios", "indice"],
    ["Red Natura 2000", "natura"],
  ] as const;
  const nav = page.getByRole("navigation", { name: "Saltar a" });
  for (const [name] of targets) {
    await page.keyboard.press("Tab");
    const link = nav.getByRole("link", { name, exact: true });
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport();
  }
  for (const [name, id] of targets) {
    await page.goto("/");
    await nav.getByRole("link", { name, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
});

test("skip links hidden when a page lacks their section", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByRole("navigation", { name: "Saltar a" }).getByRole("link")).toHaveCount(0);
});

test("the map tells keyboard users to use the index", async ({ page }) => {
  await page.goto("/");
  const map = page.getByRole("img", { name: /^Mapa de Andalucía por municipios/ });
  await expect(map).toHaveAccessibleDescription(/con el teclado, usa el índice de municipios/);
});
