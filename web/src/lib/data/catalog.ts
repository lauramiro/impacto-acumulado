export type CatalogColumn = { name: string; type: string; meaning: string };
export type CatalogEntry = { file: string; description: string; columns?: CatalogColumn[] };

const ENUM_NOTE = "valor de la lista de estados";
const TECH_NOTE = "valor de la lista de tecnologías";
const VERDICT_NOTE = "valor de la lista de resultados de la resolución";
const ROLE_NOTE = "valor de la lista de tipos de documento";

export const CATALOG: CatalogEntry[] = [
  {
    file: "projects.csv",
    description: "Un proyecto por fila, tal como lo agrupa el pipeline a partir de sus documentos.",
    columns: [
      { name: "id", type: "entero", meaning: "Identificador estable; es el id del documento más antiguo del grupo" },
      { name: "canonical_name", type: "texto", meaning: "Nombre del proyecto en el documento más reciente que lo cita" },
      { name: "developer", type: "texto", meaning: "Promotor; vacío si no se identifica" },
      { name: "technology", type: "texto", meaning: TECH_NOTE },
      { name: "status", type: "texto", meaning: ENUM_NOTE },
      { name: "mw_peak", type: "decimal", meaning: "Potencia pico en MW; vacío si no consta" },
      { name: "mw_nominal", type: "decimal", meaning: "Potencia nominal en MW; vacío si no consta" },
      { name: "hectares", type: "decimal", meaning: "Superficie en hectáreas; vacío si no consta" },
      { name: "turbines", type: "entero", meaning: "Aerogeneradores; vacío si no consta" },
      { name: "status_document_id", type: "entero", meaning: "id en documents.csv del documento que fija el estado" },
      { name: "first_seen", type: "fecha", meaning: "Primera publicación (AAAA-MM-DD)" },
      { name: "last_seen", type: "fecha", meaning: "Última publicación (AAAA-MM-DD)" },
      { name: "municipalities", type: "texto", meaning: "Nombres de municipio separados por punto y coma" },
      { name: "ine_codes", type: "texto", meaning: "Códigos INE en el mismo orden que municipalities" },
      { name: "provinces", type: "texto", meaning: "Provincias separadas por punto y coma" },
      { name: "document_urls", type: "texto", meaning: "URLs de los documentos separadas por espacio" },
    ],
  },
  {
    file: "documents.csv",
    description: "Un documento del BOE o el BOJA por fila, con el proyecto al que se ha asignado.",
    columns: [
      { name: "id", type: "entero", meaning: "Identificador del documento" },
      { name: "source", type: "texto", meaning: "boe o boja" },
      { name: "source_id", type: "texto", meaning: "Identificador en el boletín (BOE-A-… o disposition.…)" },
      { name: "published_at", type: "fecha", meaning: "Fecha de publicación" },
      { name: "title", type: "texto", meaning: "Título tal como aparece en el boletín" },
      { name: "url", type: "texto", meaning: "Enlace al boletín" },
      { name: "project_id", type: "entero", meaning: "id en projects.csv; vacío si no se agrupó" },
      { name: "role", type: "texto", meaning: ROLE_NOTE },
      { name: "match_score", type: "decimal", meaning: "Confianza de la agrupación, de 0 a 1" },
      { name: "confidence", type: "decimal", meaning: "Confianza declarada por el modelo de extracción, de 0 a 1" },
      { name: "verdict", type: "texto", meaning: VERDICT_NOTE },
      { name: "doc_type", type: "texto", meaning: "Tipo de documento según la extracción" },
    ],
  },
  {
    file: "municipality_stats.csv",
    description: "Totales por municipio, estado y tecnología. Un proyecto en varios municipios cuenta íntegro en cada uno.",
    columns: [
      { name: "ine_code", type: "texto", meaning: "Código INE de cinco cifras" },
      { name: "status", type: "texto", meaning: ENUM_NOTE },
      { name: "technology", type: "texto", meaning: "Tecnología" },
      { name: "project_count", type: "entero", meaning: "Proyectos" },
      { name: "mw_nominal", type: "decimal", meaning: "Suma de MW nominales" },
      { name: "hectares", type: "decimal", meaning: "Suma de hectáreas" },
      { name: "turbines", type: "entero", meaning: "Suma de aerogeneradores" },
      { name: "name", type: "texto", meaning: "Nombre del municipio" },
      { name: "province", type: "texto", meaning: "Provincia" },
    ],
  },
  {
    file: "province_monthly.csv",
    description: "Proyectos y MW por provincia, mes y resultado de la resolución.",
    columns: [
      { name: "province", type: "texto", meaning: "Provincia" },
      { name: "month", type: "fecha", meaning: "Primer día del mes" },
      { name: "verdict", type: "texto", meaning: "Resultado de la resolución" },
      { name: "project_count", type: "entero", meaning: "Proyectos" },
      { name: "mw_nominal", type: "decimal", meaning: "Suma de MW nominales" },
    ],
  },
  { file: "protected_area_stats.json", description: "Por espacio de la Red Natura 2000 y estado: proyectos cuyo municipio intersecta el espacio (a nivel de municipio, no de parcela)." },
  { file: "municipality_protected_areas.json", description: "Por código INE, los espacios de la Red Natura 2000 que intersectan el término municipal." },
  { file: "municipalities.geojson", description: "Límites municipales (DERA) simplificados a unos 50 m, con superficie y cuota de sensibilidad alta o máxima." },
  { file: "protected_areas.geojson", description: "Espacios de la Red Natura 2000 en Andalucía, simplificados a unos 50 m." },
  { file: "provinces.geojson", description: "Límites provinciales, unión de los municipios." },
  {
    file: "meta.json",
    description: "Manifiesto de la exportación: fecha de generación, recuentos por tabla y filas y tamaño de cada uno de los demás archivos.",
  },
  { file: "evaluation.json", description: "Precisión medida de la extracción, por campo, sobre el conjunto etiquetado a mano." },
];

// municipality_stats.json y municipalities_map.geojson quedan fuera a propósito: son
// versiones internas, en forma apta para la web, de datos que ya están en esta lista
// (municipality_stats.csv y municipalities.geojson respectivamente) y no aportan
// información nueva. Ver docs/superpowers/specs/2026-09-22-web-slice-2-design.md.
