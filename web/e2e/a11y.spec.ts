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

for (const url of ["/", "/municipio/11020", "/municipio/29084", "/proyecto/1", "/datos", "/metodologia"]) {
  test(`no serious or critical axe violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    if (url === "/") await page.locator("path[data-ine]").first().waitFor();
    await checkAxe(page, url);
  });
}

test("no serious or critical axe violations on /datos at 375px (collapsed table)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/datos");
  await checkAxe(page, "/datos@375px");
});
