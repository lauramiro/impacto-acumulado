import { expect, test } from "@playwright/test";

test("timeline title follows province and technology, and the data table opens", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: /Resoluciones por mes/ });
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Resoluciones por mes · Andalucía");
  await expect(section.getByText("Entre 2019 y 2021 la colección solo contiene 5 documentos; la serie empieza en 2022.")).toBeVisible();
  await page.getByRole("region", { name: "Por provincia" }).getByRole("button", { name: "Sevilla" }).click();
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Resoluciones por mes · Provincia de Sevilla");
  await page.getByRole("checkbox", { name: "Eólica", exact: true }).uncheck();
  await expect(section.getByRole("heading", { level: 2 })).toContainText("Solar fotovoltaica");
  await section.getByText("Ver los datos").click();
  await expect(section.getByRole("columnheader", { name: "Sin veredicto leído" })).toBeVisible();
  await section.getByRole("button", { name: "Toda Andalucía" }).click();
  await expect(page).not.toHaveURL(/provincia=/);
});

test("the timeline summary does not collide with the status filter label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Favorable con condiciones")).toHaveCount(1);
});

test("timeline empty state", async ({ page }) => {
  await page.goto("/?tecnologia=");
  await expect(page.getByRole("region", { name: /Resoluciones por mes/ }).getByText("Ninguna resolución con estos filtros.")).toBeVisible();
});

test("timeline leaves out empty rows and says the status filter does not apply", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: /Resoluciones por mes/ });
  await expect(section.getByText(/el filtro de estado no se aplica/)).toBeVisible();
  await expect(section.getByText(/Sin documentos con esta selección: Favorable\./)).toBeVisible();
  await section.getByText("Ver los datos").click();
  await expect(section.getByRole("columnheader", { name: "Favorable con condiciones" })).toBeVisible();
  await expect(section.getByRole("columnheader", { name: "Favorable", exact: true })).toHaveCount(0);
});
