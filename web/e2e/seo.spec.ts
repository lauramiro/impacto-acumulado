import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SITE = "https://impacto-acumulado.vercel.app";

test("robots.txt allows crawling and points at the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const body = await res.text();
  expect(body).toMatch(/User-Agent: \*/i);
  expect(body).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});

for (const url of ["/", "/datos", "/metodologia", "/municipio/29084", "/proyecto/1"]) {
  test(`${url} has a canonical URL and share-preview metadata`, async ({ page, request }) => {
    await page.goto(url);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", url === "/" ? SITE : `${SITE}${url}`);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Impacto Acumulado");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", await page.title());
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "es_ES");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image, "og:image").toMatch(new RegExp(`^${SITE}/opengraph-image`));
    const res = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });
}

test("the home title says what the site is", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Impacto Acumulado: .*Andaluc/);
});

test("/datos carries Dataset JSON-LD that matches the file table", async ({ page }) => {
  await page.goto("/datos");
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  const ld = JSON.parse(raw!);
  expect(ld["@type"]).toBe("Dataset");
  expect(ld.license).toBe("https://creativecommons.org/licenses/by/4.0/");
  expect(ld.url).toBe(`${SITE}/datos`);
  const hrefs: string[] = await page.locator("a[download]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(ld.distribution.map((d: { contentUrl: string }) => d.contentUrl)).toEqual(hrefs.map((h) => `${SITE}${h}`));
});

test("page routes send the security headers; data files stay open to other origins", async ({ request }) => {
  for (const url of ["/", "/datos", "/municipio/29084", "/proyecto/1", "/robots.txt"]) {
    const h = (await request.get(url)).headers();
    expect(h["x-content-type-options"], url).toBe("nosniff");
    expect(h["content-security-policy"], url).toContain("frame-ancestors 'none'");
    expect(h["referrer-policy"], url).toBe("strict-origin-when-cross-origin");
  }
  const data = await request.get("/data/meta.json");
  expect(data.status()).toBe(200);
  expect(data.headers()["content-security-policy"]).toBeUndefined();
  expect(data.headers()["x-frame-options"]).toBeUndefined();
});

test("/datos changelog row count for projects.csv is the one in meta.json", async ({ page }) => {
  const meta = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "meta.json"), "utf-8"));
  const rows = meta.files["projects.csv"].rows as number;
  await page.goto("/datos");
  const entry = page.locator("section[aria-labelledby='cambio-2026-10-05']");
  await expect(entry).toContainText(`pasa de 585 a ${rows.toLocaleString("es-ES")} filas`);
  await expect(entry).not.toContainText("587 filas");
  const retired = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "retired_projects.json"), "utf-8")) as Record<string, number>;
  for (const [from, to] of Object.entries(retired)) await expect(entry).toContainText(new RegExp(`el ${from} (pasa )?al ${to}`));
});
