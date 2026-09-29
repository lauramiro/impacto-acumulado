import { expect, test } from "@playwright/test";

test("Natura 2000 loads only when ticked and draws every site", async ({ page }) => {
  let requested = false;
  page.on("request", (r) => {
    if (r.url().endsWith("/data/protected_areas.geojson")) requested = true;
  });
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  expect(requested).toBe(false);
  await page.getByRole("checkbox", { name: "Red Natura 2000", exact: true }).check();
  await expect(page).toHaveURL(/natura=1/);
  await expect(page.locator("path[data-site]")).toHaveCount(197);
  await expect(page.getByText("Red Natura 2000 (ZEC, ZEPA, LIC)")).toBeVisible();
});

test("a sensitivity layer draws one hatched path and its caveat", async ({ page }) => {
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  await page.getByRole("radio", { name: "Fotovoltaica", exact: true }).check();
  await expect(page).toHaveURL(/sensibilidad=fv/);
  await expect(page.locator('path[data-sensitivity="ftv"]')).toHaveCount(1);
  await expect(page.getByText("La ubicación de los proyectos dentro del municipio no se conoce.")).toBeVisible();
  await page.getByRole("radio", { name: "Eólica", exact: true }).check();
  await expect(page.locator('path[data-sensitivity="eol"]')).toHaveCount(1);
  await expect(page.locator('path[data-sensitivity="ftv"]')).toHaveCount(0);
});

test("overlays in the URL load on first render", async ({ page }) => {
  await page.goto("/?natura=1&sensibilidad=eolica");
  await expect(page.locator("path[data-site]")).toHaveCount(197);
  await expect(page.locator('path[data-sensitivity="eol"]')).toHaveCount(1);
});

test("a failed layer shows an inline error and retries on re-tick", async ({ page }) => {
  let fail = true;
  await page.route("**/data/protected_areas.geojson", (route) => (fail ? route.fulfill({ status: 500, body: "" }) : route.continue()));
  await page.goto("/");
  await page.locator("path[data-ine]").first().waitFor();
  const box = page.getByRole("checkbox", { name: "Red Natura 2000", exact: true });
  await box.check();
  await expect(page.getByText("No se ha podido cargar la capa. Vuelve a intentarlo.")).toBeVisible();
  fail = false;
  await box.uncheck();
  await box.check();
  await expect(page.locator("path[data-site]")).toHaveCount(197);
  await expect(page.getByText("No se ha podido cargar la capa. Vuelve a intentarlo.")).toHaveCount(0);
});

test("a click inside a site still selects the municipality", async ({ page }) => {
  await page.goto("/?natura=1");
  await expect(page.locator("path[data-site]")).toHaveCount(197);
  await page.locator("path[data-ine='11020']").dispatchEvent("click");
  await expect(page.getByRole("heading", { level: 2, name: "Jerez de la Frontera" })).toBeVisible();
});
