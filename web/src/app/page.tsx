import type { Metadata } from "next";
import Link from "next/link";
import { FeedLink } from "@/components/feed-link";
import { MapExplorer } from "@/components/map/map-explorer";
import { ConsultationSources, OpenConsultations } from "@/components/open-consultations";
import { compactMapData } from "@/lib/compact";
import { stillOpen } from "@/lib/consultations";
import { loadOpenConsultations } from "@/lib/data/consultations";
import { loadMapData } from "@/lib/data/map-data";
import { formatCoverage, formatDate, formatInt, formatMw } from "@/lib/format";
import { sumFigures } from "@/lib/metrics";
import { SITE_URL } from "@/lib/site";
import { APPROVED_OR_PENDING, NO_VERDICT, PROVINCES, REFUSED_OR_LAPSED, REGION, type StatsCell, type Status } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "./", types: { "application/atom+xml": [{ url: `${SITE_URL}/feeds/andalucia.xml`, title: "Documentos en Andalucía" }] } },
};

export default async function HomePage() {
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
  const inGroup = (cells: StatsCell[], group: readonly Status[]) => sumFigures(cells.filter((c) => group.includes(c.status)));
  // A project whose gazette notice states no verdict is given apart: the
  // gazette does not say it was approved, so it does not swell that figure.
  const accumulating = inGroup(provinceStats[REGION], APPROVED_OR_PENDING);
  const noVerdict = inGroup(provinceStats[REGION], NO_VERDICT);
  const refused = inGroup(provinceStats[REGION], REFUSED_OR_LAPSED);
  // Ranked on what is accumulating: a province is not "ahead" on refused projects.
  const leaders = PROVINCES.map((p) => ({ province: p, mw: inGroup(provinceStats[p], APPROVED_OR_PENDING).mwBest }))
    .sort((a, b) => b.mw - a.mw)
    .slice(0, 2)
    .map((r) => r.province)
    .join(" y ");
  return (
    <>
      <div className={styles.entrada}>
        <h1 className={`display ${styles.titular}`}>El impacto acumulado de las renovables, municipio a municipio</h1>
        <p className={styles.dek}>
          Cada proyecto renovable se evalúa por separado; este mapa suma lo que se acumula en cada municipio a partir de{" "}
          {formatInt(region.projectCount)} proyectos publicados en el BOE y el BOJA. Aprobados o en trámite:{" "}
          <span className="dato" data-testid="mw-acumulando">{formatMw(accumulating.mwBest)}</span> (
          {formatCoverage(accumulating.mwCount, accumulating.projectCount, "mw", accumulating.mwPeakCount)}), con {leaders} a la
          cabeza. <Link href="/metodologia#sin-veredicto">Sin veredicto en el boletín</Link>:{" "}
          <span className="dato" data-testid="mw-sin-veredicto">{formatMw(noVerdict.mwBest)}</span> en{" "}
          {formatInt(noVerdict.projectCount)} proyectos. Denegados o caducados:{" "}
          <span className="dato" data-testid="mw-denegados">{formatMw(refused.mwBest)}</span>.
        </p>
        {/* One line here keeps the map in the first screen; the list is below the map. */}
        <p className={styles.consultas} data-testid="consultas">
          <a href="#informacion-publica">En información pública</a>:{" "}
          {open.length === 0
            ? "ningún plazo abierto"
            : `${formatInt(open.length)} ${open.length === 1 ? "anuncio abierto" : "anuncios abiertos"}${firstDeadline ? `, el primero hasta el ${formatDate(firstDeadline)}` : ""}`}{" "}
          <ConsultationSources short />
        </p>
      </div>
      <MapExplorer
        data={compactMapData({
          municipalities: municipalities.map(({ ine, name, province, areaHa }) => ({ ine, name, province, areaHa })),
          stats,
          provinceStats,
          events,
          sites,
        })}
        lastMonth={lastMonth}
      />
      <OpenConsultations items={open} today={today} names={names} />
      <FeedLink href="/feeds/andalucia.xml" label="Seguir todos los documentos de Andalucía" />
    </>
  );
}
