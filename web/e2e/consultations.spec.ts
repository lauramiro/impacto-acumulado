import { expect, test } from "@playwright/test";

test("the intro says what is open for objections and links to the list below the map", async ({ page }) => {
  await page.goto("/");
  const line = page.getByText(/^En información pública:/);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/ningún plazo abierto|\d+ anuncios? abiertos?/);
  // An empty list means none open in the sources the site reads, so the line names them and links to the limit.
  await expect(line).toContainText("en BOE y BOJA ambiental");
  await expect(line.getByRole("link", { name: "no cubre energía ni BOP" })).toHaveAttribute(
    "href",
    "/metodologia#lo-que-no-cubre",
  );
  await line.getByRole("link", { name: "En información pública" }).click();
  await expect(page).toHaveURL(/#informacion-publica$/);
  const section = page.getByRole("region", { name: "En información pública", exact: true });
  await expect(section).toBeVisible();
  // The data decides whether anything is open; either way the section says so.
  const items = section.getByRole("listitem");
  await expect(section.getByRole("link", { name: /no se recogen los anuncios de la consejería de energía/ })).toHaveAttribute(
    "href",
    "/metodologia#lo-que-no-cubre",
  );
  if ((await items.count()) === 0) {
    await expect(section.getByText(/Ningún anuncio con plazo de alegaciones abierto a \d+ de \w+ de \d{4} \(BOE y consejería/)).toBeVisible();
  } else {
    await expect(items.first()).toContainText(/Hasta el \d+ de \w+ de \d{4}|El anuncio no indica plazo/);
    await expect(items.first().getByRole("link", { name: /Anuncio en el (BOE|BOJA)/ })).toBeVisible();
  }
});
