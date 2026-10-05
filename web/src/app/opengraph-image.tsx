import { ImageResponse } from "next/og";
import { loadMeta } from "@/lib/data/meta";
import { formatInt, formatLongDate } from "@/lib/format";

export const alt = "Impacto Acumulado: resoluciones ambientales de proyectos renovables en Andalucía";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// One image for every route (a route segment without its own opengraph-image
// inherits this one). The figures come from meta.json, as on /datos.
export default async function Image() {
  const meta = await loadMeta();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f6f1e7", color: "#1d1b18" }}>
        <div style={{ fontSize: 40, letterSpacing: 4, textTransform: "uppercase" }}>Impacto Acumulado</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, lineHeight: 1.1 }}>El impacto acumulado de las renovables, municipio a municipio</div>
          <div style={{ fontSize: 34, marginTop: 36 }}>
            {`${formatInt(meta.counts.projects)} proyectos del BOE y el BOJA en Andalucía. Datos a ${formatLongDate(meta.generatedAt)}.`}
          </div>
        </div>
        <div style={{ fontSize: 28 }}>impacto-acumulado.vercel.app</div>
      </div>
    ),
    size,
  );
}
