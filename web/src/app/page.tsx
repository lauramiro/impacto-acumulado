import { preload } from "react-dom";
import { MapExplorer } from "@/components/map/map-explorer";
import { compactMapData } from "@/lib/compact";
import { loadMapData } from "@/lib/data/map-data";
import { formatCoverage, formatInt, formatMw } from "@/lib/format";
import { sumFigures } from "@/lib/metrics";
import { PROVINCES, REGION } from "@/lib/types";
import styles from "./page.module.css";

export default async function HomePage() {
  preload("/data/municipalities_map.geojson", { as: "fetch", crossOrigin: "anonymous" });
  preload("/data/provinces.geojson", { as: "fetch", crossOrigin: "anonymous" });
  const { municipalities, stats, provinceStats, events, sites, lastMonth } = await loadMapData();
  const region = sumFigures(provinceStats[REGION]);
  const leaders = PROVINCES.map((p) => ({ province: p, mw: sumFigures(provinceStats[p]).mwNominal }))
    .sort((a, b) => b.mw - a.mw)
    .slice(0, 2)
    .map((r) => r.province)
    .join(" y ");
  return (
    <>
      <div className={styles.entrada}>
        <h1 className={`display ${styles.titular}`}>El impacto acumulado de las renovables, municipio a municipio</h1>
        <p className={styles.dek}>
          Cada proyecto renovable se evalúa por separado; este mapa reúne las evaluaciones ambientales de{" "}
          {formatInt(region.projectCount)} proyectos publicadas en el BOE y el BOJA y suma lo que se acumula en cada municipio. En
          conjunto suman <span className="dato">{formatMw(region.mwNominal)}</span> ({formatCoverage(region.mwCount, region.projectCount)}),
          con {leaders} a la cabeza en MW declarados.
        </p>
      </div>
      <MapExplorer
        data={compactMapData({
          municipalities: municipalities.map(({ ine, name, province }) => ({ ine, name, province })),
          stats,
          provinceStats,
          events,
          sites,
        })}
        lastMonth={lastMonth}
      />
    </>
  );
}
