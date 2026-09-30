import { describe, expect, it } from "vitest";
import { siteName } from "@/lib/data/site-names";

describe("siteName", () => {
  it("writes capitals as a name, with particles in lower case", () => {
    expect(siteName("ES6130001", "SIERRA DE CARDEÑA Y MONTORO")).toBe("Sierra de Cardeña y Montoro");
    expect(siteName("ES0000024", "DOÑANA")).toBe("Doñana");
    expect(siteName("ES6170006", "LOS REALES DE SIERRA BERMEJA")).toBe("Los Reales de Sierra Bermeja");
  });

  it("starts a new place name after a hyphen or a slash and keeps Roman numerals", () => {
    expect(siteName("ES6180016", "SALADO DE LEBRIJA-LAS CABEZAS")).toBe("Salado de Lebrija-Las Cabezas");
    expect(siteName("ES6110017", "SIERRA MARIA - LOS VELEZ")).toBe("Sierra María - Los Vélez");
    expect(siteName("ES6110012", "YESO III, HIGUERONES IX Y EL MARRUBIO")).toBe("Yeso III, Higuerones IX y El Marrubio");
  });

  it("restores the names the source cut at 50 characters", () => {
    expect(siteName("ES6110006", "RAMBLAS DE GERGAL, TABERNAS Y SUR DE SIERRA ALHAM*")).toBe("Ramblas de Gérgal, Tabernas y Sur de Sierra Alhamilla");
    expect(siteName("ES6160010", "TRAMO INFERIOR DEL RIO GUADALIMAR Y ALTO GUADALQU*")).toBe("Tramo Inferior del Río Guadalimar y Alto Guadalquivir");
    expect(siteName("ES6180007", "ARROYO DE SANTIAGO, SALADO DE MORON Y MATABUEYES/*")).toBe(
      "Arroyo de Santiago, Salado de Morón y Matabueyes/Garrapata",
    );
  });

  it("restores the accents the layer drops", () => {
    expect(siteName("ES6120021", "RIO GUADALETE")).toBe("Río Guadalete");
    expect(siteName("ES6120031", "RIOS GUADIARO Y HOZGARGANTA")).toBe("Ríos Guadiaro y Hozgarganta");
    expect(siteName("ES6120014", "LAGUNA DE LAS CANTERAS Y EL TEJON")).toBe("Laguna de las Canteras y El Tejón");
    expect(siteName("ES0000140", "BAHIA DE CADIZ")).toBe("Bahía de Cádiz");
    expect(siteName("ES6110008", "SIERRA DE GADOR Y ENIX")).toBe("Sierra de Gádor y Énix");
  });
});
