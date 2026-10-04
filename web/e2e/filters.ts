import { expect, type Page } from "@playwright/test";

/** Unfolds Estado, Tecnología and Capas, which sit behind the "Filtros" toggle at every width. */
export async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
