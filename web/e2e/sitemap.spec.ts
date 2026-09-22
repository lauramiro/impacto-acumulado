import { expect, test } from "@playwright/test";

test("sitemap lists the map, a municipality, a project and the static pages", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  for (const path of ["/", "/municipio/29084", "/proyecto/", "/metodologia", "/datos"]) {
    expect(xml, path).toContain(`https://impacto-acumulado.vercel.app${path}`);
  }
});

test("footer links to methodology and data on every page family", async ({ page }) => {
  for (const url of ["/", "/municipio/29084", "/proyecto/1"]) {
    await page.goto(url);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Datos" })).toHaveAttribute("href", "/datos");
  }
});
