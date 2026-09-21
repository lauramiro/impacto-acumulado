import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const url of ["/", "/municipio/11020", "/municipio/29084"]) {
  test(`no serious or critical axe violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    if (url === "/") await page.locator("path[data-ine]").first().waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
  });
}
