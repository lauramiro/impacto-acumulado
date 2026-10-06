import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function checkAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const nonSevere = results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  if (nonSevere.length > 0) {
    console.log(
      `axe non-severe violations on ${label}: ${nonSevere.map((v) => `${v.id} (${v.impact})`).join(", ")}`,
    );
  }
  expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
}

for (const url of ["/", "/municipio/11020", "/municipio/29084", "/municipio/41024", "/proyecto/1", "/datos", "/acerca", "/metodologia", "/promotores", "/promotor/tayant-investment-12", "/resultados"]) {
  test(`no serious or critical axe violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    if (url === "/") await page.locator("path[data-ine]").first().waitFor();
    await checkAxe(page, url);
  });
}

test("no axe violations of any impact on /municipio/41024, which has two possible-splitting groups", async ({ page }) => {
  await page.goto("/municipio/41024");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("no serious or critical axe violations on /datos at 375px (collapsed table)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/datos");
  await checkAxe(page, "/datos@375px");
});

test("no serious or critical axe violations on / with overlays, a province and the timeline data open", async ({ page }) => {
  await page.goto("/?natura=1&sensibilidad=fv&provincia=sevilla");
  await expect(page.locator("path[data-site]")).toHaveCount(197);
  await expect(page.locator('path[data-sensitivity="ftv"]')).toHaveCount(1);
  await page.getByText("Ver los datos").click();
  await checkAxe(page, "/ with overlays");
});
