// Readable labels for a gazette document, read from its title.

const PROVINCES = "Almería|Cádiz|Córdoba|Granada|Huelva|Jaén|Málaga|Sevilla";

const AUTHORITY =
  /\b(?:de la|del)\s+((?:Dirección General|Delegación Territorial|Delegación del Gobierno|Subdelegación del Gobierno|Secretaría (?:General|de Estado)|Viceconsejería|Dependencia|Área|Confederación Hidrográfica)[^,.;]*?)(?=,| por | sobre | de información| relativ| que |\.|$)/;
const TERRITORIAL = new RegExp(`Delegación Territorial[^]*? en (${PROVINCES})\\b`);

/**
 * The body that issued the document, as the title names it: "Dirección General
 * de Calidad y Evaluación Ambiental", "Delegación Territorial en Sevilla",
 * "Área de Industria y Energía de la Subdelegación del Gobierno en Huelva".
 * Null when the title names none in a known form.
 */
export function authority(title: string): string | null {
  const m = AUTHORITY.exec(title);
  if (!m) return null;
  const name = m[1]!.trim();
  if (name.startsWith("Delegación Territorial")) {
    // "Delegación Territorial de Sostenibilidad, Medio Ambiente y Economía Azul en Sevilla": the comma cuts the match.
    const t = TERRITORIAL.exec(title);
    return t ? `Delegación Territorial en ${t[1]}` : "Delegación Territorial";
  }
  return name;
}

/** A correction of errors in an earlier document: it does not decide anything new. */
export function isCorrection(title: string): boolean {
  return /correcci[oó]n de errores/i.test(title);
}
