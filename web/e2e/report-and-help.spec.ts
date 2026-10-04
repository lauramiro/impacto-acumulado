import { expect, test } from "@playwright/test";

for (const [path, subject] of [
  ["/municipio/11021", "Error en Jimena de la Frontera (INE 11021)"],
  ["/proyecto/34", "Error en el proyecto 34"],
]) {
  test(`${path} offers a prefilled error report`, async ({ page }) => {
    await page.goto(path);
    const link = page.getByRole("link", { name: "Avísanos" });
    const href = new URL((await link.getAttribute("href"))!);
    expect(href.origin + href.pathname).toBe("https://github.com/lauramiro/impacto-acumulado/issues/new");
    expect(href.searchParams.get("title")).toContain(subject);
    expect(href.searchParams.get("body")).toContain(`https://impacto-acumulado.vercel.app${path}`);
  });
}

test("/datos states the reuse conditions, points to mw_nominal and explains feeds", async ({ page }) => {
  await page.goto("/datos");
  await expect(page.getByText(/conforme a la Ley 37\/2007/)).toBeVisible();
  await expect(page.getByText(/Para trabajar solo con la nominal, usa la columna/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seguir los cambios" })).toBeVisible();
  await expect(page.getByText(/El sitio no recomienda ninguno ni guarda direcciones de correo/)).toBeVisible();
});
