import { expect, test } from "@playwright/test";

// The page names the publisher from lib/publisher.ts, gives an email next to GitHub,
// and invents nothing for the constants still unset (no funding line yet).
test("/acerca states privacy, corrections and citation, and is linked from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Acerca de" }).click();
  await expect(page).toHaveURL(/\/acerca$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acerca de");
  await expect(page).toHaveTitle("Acerca de · Impacto Acumulado");
  for (const h of ["Quién lo mantiene", "Independencia y financiación", "Contacto", "Correcciones", "Privacidad", "Cómo citar"]) {
    await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  }
  await expect(page.getByText("no usa cookies, no carga analítica, no tiene cuentas de usuario")).toBeVisible();
  await expect(page.getByTestId("cita")).toContainText("Laura Miro Rodrigo (");
  await expect(page.getByRole("link", { name: "Cambios" })).toHaveAttribute("href", "/datos#cambios");
  await expect(page.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", /creativecommons\.org\/licenses\/by\/4\.0/);
  await expect(page.getByRole("link", { name: "MIT" })).toHaveAttribute("href", "https://spdx.org/licenses/MIT.html");
  await expect(page.locator("main")).toContainText("El sitio lo mantiene y publica Laura Miro Rodrigo.");
  await expect(page.getByRole("link", { name: "lmirorodrigo@gmail.com" })).toHaveAttribute("href", "mailto:lmirorodrigo@gmail.com");
  await expect(page.locator("main")).not.toContainText(/\bpendiente\b|por definir/i);
});

test("/acerca answers 200 and has a canonical URL", async ({ page, request }) => {
  expect((await request.get("/acerca")).status()).toBe(200);
  await page.goto("/acerca");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://impacto-acumulado.vercel.app/acerca");
});

test("the 404 page has its own title; every page and the 404 link an icon", async ({ page, request }) => {
  const res = await page.goto("/nope");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("Página no encontrada · Impacto Acumulado");
  for (const url of ["/", "/acerca", "/datos", "/nope"]) {
    await page.goto(url);
    const href = await page.locator('link[rel~="icon"]').first().getAttribute("href");
    expect(href, url).toBeTruthy();
    expect((await request.get(href!)).status(), url).toBe(200);
  }
});
