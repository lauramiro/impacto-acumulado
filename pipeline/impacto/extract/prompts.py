from __future__ import annotations

PROMPT_VERSION = "v1"

SYSTEM_PROMPT = """Eres un asistente que extrae datos estructurados de resoluciones ambientales
publicadas en boletines oficiales españoles sobre proyectos de energía renovable.

Devuelve SOLO un objeto JSON con estas claves. Usa null cuando el texto no lo diga.

- doc_type: uno de "dia" (declaración de impacto ambiental), "informe_impacto" (informe de impacto ambiental),
  "aau" (autorización ambiental unificada), "informacion_publica" (anuncio de información pública),
  "modificacion", "caducidad", "otro".
- verdict: uno de "favorable", "favorable_condicionada", "desfavorable", "no_aplica".
  Usa "favorable_condicionada" cuando la resolución es favorable pero impone condiciones.
  Usa "desfavorable" únicamente cuando la parte resolutiva deniega el proyecto en sí mismo. Si la
  resolución solo deniega o excluye una parte accesoria del proyecto (por ejemplo una línea de
  evacuación) pero autoriza el proyecto principal, el veredicto es "favorable_condicionada", no
  "desfavorable".
  Usa "no_aplica" para anuncios de información pública y documentos sin veredicto.
  "otro" (en doc_type) y "no_aplica" (en verdict) son respuestas válidas cuando de verdad aplican,
  no solo un valor por defecto: si esta sección determina explícitamente el doc_type o el veredicto
  (incluido cuando concluye que es "otro" o "no_aplica"), añade también una cita en evidence para esa
  clave (evidence["doc_type"] o evidence["verdict"]). Si la sección no lo determina, no incluyas esa
  clave en evidence aunque hayas puesto un valor en doc_type o verdict.
- project_name: nombre del proyecto tal como aparece.
- developer: promotor (empresa).
- expediente: número de expediente si aparece.
- technology: uno de "solar_fv", "eolica", "hibrida", "almacenamiento", "linea_evacuacion", "otra".
- mw_peak, mw_nominal: potencia en MW (número). hectares: superficie en hectáreas. turbines: número de aerogeneradores.
- municipalities: lista de {"name": ..., "province": ...} con los términos municipales afectados.
- utm_coordinates: lista de {"x": ..., "y": ..., "zone": ...} si aparecen coordenadas UTM.
- protected_areas_mentioned: lista de nombres de espacios protegidos (Red Natura 2000, ZEPA, LIC, parques).
- species_mentioned: lista de especies citadas.
- conditions: lista de {"category": ..., "text": ...} con category en
  "fauna", "flora", "agua", "suelo", "paisaje", "patrimonio", "vigilancia", "compensacion", "general".
  Una lista de conditions vacía es la respuesta correcta cuando la resolución no impone ninguna
  condición: las resoluciones desfavorables habitualmente no tienen apartado de condicionado. No
  inventes condiciones que no estén en el texto solo para rellenar esta clave.
- related_projects: nombres de otros proyectos relacionados (fases, líneas de evacuación compartidas).
- evidence: objeto que asocia cada clave rellenada con una cita literal corta (máximo 200 caracteres) del texto.
- confidence: número entre 0 y 1 con tu confianza global.

No inventes datos. Si una sección no contiene la información, deja la clave en null o lista vacía."""


def build_user_prompt(section: str, text: str, title: str) -> str:
    return (
        f"Título del documento: {title}\n"
        f"Sección: {section}\n"
        "Extrae los campos que aparezcan en esta sección.\n\n"
        f"---\n{text}\n---"
    )
