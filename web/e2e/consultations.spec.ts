import { expect, test } from "@playwright/test";

test("the intro says what is open for objections and links to the list below the map", async ({ page }) => {
  await page.goto("/");
  const line = page.getByText(/^En información pública:/);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/ningún plazo de alegaciones abierto\.|\d+ anuncios? abiertos?/);
  await line.getByRole("link", { name: "En información pública" }).click();
  await expect(page).toHaveURL(/#informacion-publica$/);
  const section = page.getByRole("region", { name: "En información pública", exact: true });
  await expect(section).toBeVisible();
  // The data decides whether anything is open; either way the section says so.
  const items = section.getByRole("listitem");
  if ((await items.count()) === 0) {
    await expect(section.getByText(/Ningún anuncio con plazo de alegaciones abierto a \d+ de \w+ de \d{4}\./)).toBeVisible();
  } else {
    await expect(items.first()).toContainText(/Hasta el \d+ de \w+ de \d{4}|El anuncio no indica plazo/);
    await expect(items.first().getByRole("link", { name: /Anuncio en el (BOE|BOJA)/ })).toBeVisible();
  }
});
