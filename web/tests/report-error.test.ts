import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function render(email: string | null): Promise<string> {
  vi.resetModules();
  vi.doMock("@/lib/publisher", () => ({ CONTACT_EMAIL: email }));
  const { ReportError } = await import("@/components/report-error");
  return renderToStaticMarkup(createElement(ReportError, { subject: "Proyecto 1", path: "/proyecto/1" }));
}

afterEach(() => vi.doUnmock("@/lib/publisher"));

describe("ReportError", () => {
  it("offers only the GitHub route while no contact email is set", async () => {
    const html = await render(null);
    expect(html).toContain("github.com/lauramiro/impacto-acumulado/issues/new");
    expect(html).not.toContain("mailto:");
  });

  it("adds a prefilled email next to GitHub once an email is set", async () => {
    const html = await render("contacto@ejemplo.test");
    expect(html).toContain("issues/new");
    expect(html).toContain("mailto:contacto@ejemplo.test?subject=Error%20en%20Proyecto%201");
    expect(decodeURIComponent(html.replace(/[+]/g, " "))).toContain("Página: https://impacto-acumulado.vercel.app/proyecto/1");
  });
});
