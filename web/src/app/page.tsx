import { preload } from "react-dom";
import { MapExplorer } from "@/components/map/map-explorer";
import { OpenConsultations } from "@/components/open-consultations";
import { compactMapData } from "@/lib/compact";
import { stillOpen } from "@/lib/consultations";
import { loadOpenConsultations } from "@/lib/data/consultations";
import { loadMapData } from "@/lib/data/map-data";
import { formatCoverage, formatDate, formatInt, formatMw } from "@/lib/format";
import { sumFigures } from "@/lib/metrics";
import { PROVINCES, REGION } from "@/lib/types";
import styles from "./page.module.css";

export default async function HomePage() {
  preload("/data/municipalities_map.geojson", { as: "fetch", crossOrigin: "anonymous" });
  preload("/data/provinces.geojson", { as: "fetch", crossOrigin: "anonymous" });
  const [{ municipalities, stats, provinceStats, events, sites, lastMonth }, { consultations }] = await Promise.all([
    loadMapData(),
    loadOpenConsultations(),
  ]);
  // The build date: the page is static, so open means open when it was built.
  const today = new Date();
  const open = stillOpen(consultations, today);
  const names = new Map(municipalities.map((m) => [m.ine, m.name]));
  const firstDeadline = open.find((c) => c.deadline)?.deadline;
  const region = sumFigures(provinceStats[REGION]);
  const leaders = PROVINCES.map((p) => ({ province: p, mw: sumFigures(provinceStats[p]).mwBest }))
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
          conjunto suman <span className="dato">{formatMw(region.mwBest)}</span> ({formatCoverage(region.mwCount, region.projectCount, "mw", region.mwPeakCount)}),
          con {leaders} a la cabeza en MW declarados.
        </p>
        {/* One line here keeps the map in the first screen; the list is below the map. */}
        <p className={styles.consultas}>
          <a href="#informacion-publica">En información pública</a>:{" "}
          {open.length === 0
            ? "ningún plazo de alegaciones abierto."
            : `${formatInt(open.length)} ${open.length === 1 ? "anuncio abierto" : "anuncios abiertos"}${firstDeadline ? `, el primero hasta el ${formatDate(firstDeadline)}` : ""}.`}
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
      <OpenConsultations items={open} today={today} names={names} />
    </>
  );
}
