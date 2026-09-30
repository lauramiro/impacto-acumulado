/**
 * The REDIAM 2016 Natura 2000 shapefile (docs/sources.md) stores names in
 * capitals and cut three of them at 50 characters, marking the cut with "*".
 * The full names are the ones the Junta de Andalucía publishes for each code
 * (Portal Ambiental, "Ventana del visitante" and ZEC management plans), kept
 * without accents like the rest of the layer.
 */
const TRUNCATED: Record<string, string> = {
  ES6110006: "RAMBLAS DE GERGAL, TABERNAS Y SUR DE SIERRA ALHAMILLA",
  ES6160010: "TRAMO INFERIOR DEL RIO GUADALIMAR Y ALTO GUADALQUIVIR",
  ES6180007: "ARROYO DE SANTIAGO, SALADO DE MORON Y MATABUEYES/GARRAPATA",
};

const LOWER = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const ROMAN = /^[ivxl]+$/;

function word(w: string, first: boolean): string {
  if (ROMAN.test(w)) return w.toUpperCase();
  if (!first && LOWER.has(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * "SIERRA DE CARDEÑA Y MONTORO" -> "Sierra de Cardeña y Montoro", restoring the
 * truncated names. A word after "-" or "/" starts a new place name
 * ("Lebrija-Las Cabezas").
 */
export function siteName(siteCode: string, raw: string): string {
  const full = (TRUNCATED[siteCode] ?? raw).toLowerCase().replace(/\s+/g, " ").trim();
  return full.replace(/\p{L}+/gu, (w, offset: number) => word(w, offset === 0 || /[-/]\s?$/.test(full.slice(0, offset))));
}
