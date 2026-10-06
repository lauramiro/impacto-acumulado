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
      { name: "status_document_id", type: "entero", meaning: "id en documents.csv del documento que fija el estado, o el más reciente si ninguno lo fija (status = desconocido)" },
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
      { name: "match_score", type: "decimal", meaning: "Confianza de la agrupación, de 0 a 1; 1 para una corrección unida al documento que cita" },
      { name: "confidence", type: "decimal", meaning: "Confianza declarada por el modelo de extracción, de 0 a 1" },
      { name: "verdict", type: "texto", meaning: VERDICT_NOTE },
      { name: "doc_type", type: "texto", meaning: "Tipo de documento según la extracción" },
      { name: "corrects_document_id", type: "entero", meaning: "Si es una corrección de errores: id del documento que corrige, en el mismo proyecto; vacío en los demás" },
    ],
  },
  {
    file: "developers.json",
    description:
      "Un promotor por entrada: las grafías con que lo nombran los boletines unidas en una clave (sin forma jurídica, mayúsculas, acentos ni puntuación), sus proyectos y sus MW por estado. Un proyecto atribuido a varias sociedades cuenta en cada una.",
    columns: [
      { name: "key", type: "texto", meaning: "Clave normalizada; la página del promotor es /promotor/key" },
      { name: "name", type: "texto", meaning: "La grafía más frecuente" },
      { name: "names", type: "lista", meaning: "Todas las grafías tal como aparecen en developer de projects.csv" },
      { name: "family", type: "texto", meaning: "La clave sin el número final (Tayant Investment 12 y 15 comparten family): un patrón de nombre, no un grupo comprobado" },
      { name: "group", type: "texto", meaning: "Grupo asignado a mano en pipeline/reference/developer_groups.csv; vacío si no hay" },
      { name: "parent_company", type: "texto", meaning: "Sociedad matriz, solo con fuente; vacío si no hay" },
      { name: "source_url", type: "texto", meaning: "Fuente de group y parent_company" },
      { name: "project_ids", type: "lista", meaning: "id en projects.csv" },
      { name: "projects_by_status", type: "objeto", meaning: "Proyectos por estado" },
      { name: "mw_by_status", type: "objeto", meaning: "Suma de mw_best por estado, sin líneas de evacuación" },
      { name: "mw_count", type: "entero", meaning: "Proyectos cuya potencia se suma" },
    ],
  },
  {
    file: "project_details.json",
    description:
      "Por id de proyecto, lo que la extracción lee en cada documento además de la ficha: expediente, condiciones por categoría (resumidas por el modelo, no literales), especies y espacios protegidos citados, citas literales cortas que respaldan cada dato de la ficha, coordenadas UTM leídas por el modelo (utm_coordinates) y la ubicación (location): las coordenadas que publica el documento, leídas por regla, con datum, huso, la frase que las anuncia y longitud y latitud, solo las que caen junto a los municipios del proyecto. Lectura automática: el texto que vale es el del boletín.",
  },
  {
    file: "splitting_candidates.json",
    description:
      "Grupos de posible fraccionamiento: proyectos que declaran cada uno menos de 50 MW y juntos los superan, con primeros documentos dentro de 24 meses. kind familia: promotores con el mismo nombre salvo el número final, en municipios iguales o vecinos (family). kind infraestructura: plantas que enumera un mismo proyecto de evacuación o cuyos nombres citan la misma subestación, sea cual sea su promotor (infrastructure: project_ids de esos proyectos y substations). Un patrón, no una conclusión; la regla está en Metodología.",
  },
  {
    file: "municipality_stats.csv",
    description: "Totales por municipio, estado y tecnología. Un proyecto en varios municipios cuenta íntegro en cada uno.",
    columns: [
      { name: "ine_code", type: "texto", meaning: "Código INE de cinco cifras" },
      { name: "status", type: "texto", meaning: ENUM_NOTE },
      { name: "technology", type: "texto", meaning: "Tecnología" },
      { name: "project_count", type: "entero", meaning: "Proyectos" },
      { name: "mw_nominal", type: "decimal", meaning: "Suma de MW nominales, sin líneas de evacuación" },
      { name: "hectares", type: "decimal", meaning: "Suma de hectáreas" },
      { name: "turbines", type: "entero", meaning: "Suma de aerogeneradores" },
      { name: "mw_count", type: "entero", meaning: "Proyectos cuya potencia se suma: con MW declarado y que no son líneas de evacuación" },
      { name: "ha_count", type: "entero", meaning: "Proyectos cuya superficie se suma: con hectáreas declaradas" },
      { name: "mw_best", type: "decimal", meaning: "Suma de MW nominales, o de MW pico en los proyectos que solo declaran la pico; sin líneas de evacuación" },
      { name: "mw_peak_fallback_count", type: "entero", meaning: "Proyectos cuya potencia sumada en mw_best es la pico" },
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
      { name: "mw_nominal", type: "decimal", meaning: "Suma de MW nominales, sin líneas de evacuación" },
      { name: "mw_best", type: "decimal", meaning: "Suma de MW nominales, o de MW pico en los proyectos que solo declaran la pico; sin líneas de evacuación" },
      { name: "mw_peak_fallback_count", type: "entero", meaning: "Proyectos cuya potencia sumada en mw_best es la pico" },
    ],
  },
  {
    file: "monthly_events.csv",
    description:
      "Documentos por mes, provincia, tecnología y tipo de acontecimiento: información pública o resolución con su resultado. Un documento de un proyecto en varias provincias cuenta en cada una; en Andalucía, una vez.",
    columns: [
      { name: "month", type: "fecha", meaning: "Primer día del mes de publicación" },
      { name: "scope", type: "texto", meaning: "Provincia, o Andalucía para el total regional" },
      { name: "technology", type: "texto", meaning: TECH_NOTE },
      { name: "event", type: "texto", meaning: "valor de la lista de acontecimientos" },
      { name: "document_count", type: "entero", meaning: "Documentos" },
    ],
  },
  { file: "protected_area_stats.json", description: "Por espacio de la Red Natura 2000: nombre, tipo, municipios que lo intersectan y proyectos de esos municipios por estado y tecnología (a nivel de municipio, no de parcela)." },
  { file: "municipality_protected_areas.json", description: "Por código INE, los espacios de la Red Natura 2000 que intersectan el término municipal." },
  { file: "municipality_stats.json", description: "Los mismos totales por municipio que municipality_stats.csv, agrupados por código INE; es el archivo que lee el sitio." },
  { file: "province_stats.json", description: "Totales por provincia, estado y tecnología, agrupados por nombre de provincia." },
  { file: "retired_projects.json", description: "Identificadores de proyecto retirados porque su proyecto se unió a otro, con el identificador que lo recoge ahora; sus direcciones redirigen al proyecto actual." },
  { file: "municipalities_map.geojson", description: "Copia más ligera de municipalities.geojson para el mapa de la portada: límites más simplificados, sin cifras: solo código INE, nombre y provincia." },
  { file: "municipalities.geojson", description: "Límites municipales (DERA) simplificados a unos 50 m, con superficie y cuota de sensibilidad alta o máxima." },
  { file: "protected_areas.geojson", description: "Espacios de la Red Natura 2000 en Andalucía, simplificados a unos 50 m." },
  { file: "sensitivity_ftv.geojson", description: "Zonificación ambiental del Ministerio para fotovoltaica, clases alta, muy alta y máxima, disuelta y recortada a Andalucía." },
  { file: "sensitivity_eol.geojson", description: "Zonificación ambiental del Ministerio para eólica, clases alta, muy alta y máxima, disuelta y recortada a Andalucía." },
  { file: "provinces.geojson", description: "Límites provinciales, unión de los municipios." },
  {
    file: "meta.json",
    description: "Manifiesto de la exportación: fecha de generación, recuentos por tabla y filas y tamaño de cada uno de los demás archivos.",
  },
  { file: "evaluation.json", description: "Precisión medida de la extracción, por campo, sobre el conjunto etiquetado a mano." },
  {
    file: "open_consultations.json",
    description:
      "Anuncios de información pública con plazo de alegaciones abierto en la fecha de exportación: proyecto, municipios, plazo leído del anuncio con la frase que lo dice, fecha límite calculada y enlace al boletín; y la precisión de la lectura del plazo sobre anuncios etiquetados a mano.",
  },
];
