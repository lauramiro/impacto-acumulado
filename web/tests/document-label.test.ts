import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { authority, isCorrection } from "@/lib/document-label";

describe("authority", () => {
  it("names the issuing body from the title", () => {
    expect(
      authority(
        "Resolución de 13 de enero de 2023, de la Delegación Territorial de Sostenibilidad, Medio Ambiente y Economía Azul en Sevilla, por la que se da publicidad al informe vinculante",
      ),
    ).toBe("Delegación Territorial en Sevilla");
    expect(
      authority(
        "Resolución de 5 de mayo de 2021, de la Dirección General de Calidad y Evaluación Ambiental, por la que se formula declaración de impacto ambiental",
      ),
    ).toBe("Dirección General de Calidad y Evaluación Ambiental");
    expect(
      authority("Anuncio del Área de Industria y Energía de la Subdelegación del Gobierno en Huelva, por el que se somete a información pública"),
    ).toBe("Área de Industria y Energía de la Subdelegación del Gobierno en Huelva");
    expect(authority("Anuncio sin órgano")).toBeNull();
  });

  it("finds a body in nearly every published title", () => {
    const rows: { title: string }[] = parse(readFileSync(path.join(__dirname, "..", "public", "data", "documents.csv"), "utf-8"), {
      columns: true,
      bom: true,
    });
    const missing = rows.filter((r) => authority(r.title) === null);
    expect(missing.length / rows.length).toBeLessThan(0.02);
  });
});

describe("isCorrection", () => {
  it("spots a correction of errors", () => {
    expect(isCorrection("Corrección de errores de la Resolución de 3 de marzo")).toBe(true);
    expect(isCorrection("Resolución de 3 de marzo")).toBe(false);
  });
});
