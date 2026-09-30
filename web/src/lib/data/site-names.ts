/**
 * The REDIAM 2016 Natura 2000 shapefile (docs/sources.md) stores names in
 * capitals and cut three of them at 50 characters, marking the cut with "*".
 * The full names are the ones the Junta de Andalucía publishes for each code
 * (Portal Ambiental, "Ventana del visitante" and ZEC management plans), kept
 * without accents like the rest of the layer; ACCENTS restores them.
 */
const TRUNCATED: Record<string, string> = {
  ES6110006: "RAMBLAS DE GERGAL, TABERNAS Y SUR DE SIERRA ALHAMILLA",
  ES6160010: "TRAMO INFERIOR DEL RIO GUADALIMAR Y ALTO GUADALQUIVIR",
  ES6180007: "ARROYO DE SANTIAGO, SALADO DE MORON Y MATABUEYES/GARRAPATA",
};

/**
 * The layer drops most accents ("RIO GUADALETE", "SALADO DE MORON"). Every word
 * here is a place name or a common noun with one spelling, checked against all
 * 197 names in the layer, so it can be restored wherever it appears.
 */
const ACCENTS: Record<string, string> = {
  abdalajis: "abdalajís",
  aguilon: "aguilón",
  alboran: "alborán",
  alanis: "alanís",
  alcaparain: "alcaparaín",
  alpizar: "alpízar",
  andevalo: "andévalo",
  andujar: "andújar",
  bahia: "bahía",
  bedar: "bédar",
  bembezar: "bembézar",
  buho: "búho",
  bunker: "búnker",
  cadiz: "cádiz",
  cordoba: "córdoba",
  ecologico: "ecológico",
  enix: "énix",
  gador: "gádor",
  gergal: "gérgal",
  guadaira: "guadaíra",
  guadalen: "guadalén",
  guadalevin: "guadalevín",
  huetor: "huétor",
  jandula: "jándula",
  lijar: "líjar",
  magina: "mágina",
  malaha: "malahá",
  maria: "maría",
  moron: "morón",
  nijar: "níjar",
  padron: "padrón",
  rio: "río",
  rios: "ríos",
  subbetica: "subbética",
  tamujar: "tamújar",
  tejon: "tejón",
  tunel: "túnel",
  umbria: "umbría",
  velez: "vélez",
  zujar: "zújar",
};

const LOWER = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);
const ROMAN = /^[ivxl]+$/;

function word(raw: string, first: boolean): string {
  if (ROMAN.test(raw)) return raw.toUpperCase();
  const w = ACCENTS[raw] ?? raw;
  if (!first && LOWER.has(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * "SIERRA DE CARDEÑA Y MONTORO" -> "Sierra de Cardeña y Montoro", restoring the
 * truncated names and the accents. A word after "-" or "/" starts a new place name
 * ("Lebrija-Las Cabezas").
 */
export function siteName(siteCode: string, raw: string): string {
  const full = (TRUNCATED[siteCode] ?? raw).toLowerCase().replace(/\s+/g, " ").trim();
  return full.replace(/\p{L}+/gu, (w, offset: number) => word(w, offset === 0 || /[-/]\s?$/.test(full.slice(0, offset))));
}
