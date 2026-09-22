import { expect, test } from "@playwright/test";

test("data page lists every export with a working download link, the licence and a citation", async ({ page, request }) => {
  await page.goto("/datos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Datos");
  await expect(page.getByRole("link", { name: /CC BY 4\.0/ })).toHaveAttribute("href", /creativecommons\.org\/licenses\/by\/4\.0/);
  await expect(page.getByTestId("cita")).toContainText("Impacto Acumulado (");
  const links = page.locator("a[download]");
  await expect(links).toHaveCount(11);
  for (const href of await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
  }
});
