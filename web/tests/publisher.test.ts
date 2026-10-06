import { describe, expect, it } from "vitest";
import * as publisher from "@/lib/publisher";
import { citationText, datasetCreator } from "@/lib/publisher";

const base = { year: 2026, date: "21 de septiembre de 2026", url: "https://example.test/datos" };

describe("publisher", () => {
  it("carries the publisher's own facts and invents none of the rest", () => {
    expect(publisher.PUBLISHER_NAME).toBe("Laura Miro Rodrigo");
    expect(publisher.CONTACT_EMAIL).toBe("lmirorodrigo@gmail.com");
    expect(publisher.PUBLISHER_URL).toBeNull();
    expect(publisher.FUNDING_STATEMENT).toBeNull();
  });

  it("states the decided code licence", () => {
    expect(publisher.CODE_LICENSE).toBe("MIT");
    expect(publisher.CODE_LICENSE_URL).toBe("https://spdx.org/licenses/MIT.html");
  });

  it("cites the site itself when no publisher is given", () => {
    expect(citationText({ ...base, publisher: null })).toBe(
      "Impacto Acumulado (2026). Resoluciones ambientales de proyectos renovables en Andalucía, 2019 a 2026. Datos a 21 de septiembre de 2026. https://example.test/datos",
    );
  });

  it("leads the citation with the publisher once one is set", () => {
    expect(citationText({ ...base, publisher: "Persona Ejemplo" })).toMatch(/^Persona Ejemplo \(2026\)\. Impacto Acumulado\. Resoluciones/);
  });

  it("names the publisher as Dataset creator, or the site while unset", () => {
    expect(datasetCreator("https://example.test", { name: null, url: null })).toEqual({ "@type": "Organization", name: "Impacto Acumulado", url: "https://example.test" });
    expect(datasetCreator("https://example.test", { name: "Persona Ejemplo", url: "https://ejemplo.test" })).toEqual({
      "@type": "Person",
      name: "Persona Ejemplo",
      url: "https://ejemplo.test",
    });
    expect(datasetCreator("https://example.test", { name: "Persona Ejemplo", url: null })).toEqual({ "@type": "Person", name: "Persona Ejemplo" });
  });
});
