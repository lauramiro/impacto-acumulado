"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { LookupNote, LookupTable } from "@/components/lookup-table";
import { formatCoverageCell, formatInt, isUndeclared, NO_DATA } from "@/lib/format";
import { formatMetric, METRIC_LABELS } from "@/lib/labels";
import { baseMetric, metricCoverage, metricValue } from "@/lib/metrics";
import type { Filters, Metric, ProtectedAreaStats } from "@/lib/types";

type Props = { sites: readonly ProtectedAreaStats[]; metric: Metric; filters: Filters };

/** A site with its figures under the active metric and filters. */
type Row = ProtectedAreaStats & { value: number; declared: number; total: number };

/**
 * Sort key for the metric column: figures first, then sites whose projects
 * declare none ("sin dato"), then sites without projects.
 */
function rank(r: Row): number {
  return r.total === 0 ? -2 : isUndeclared(r.declared, r.total) ? -1 : r.value;
}

/** "Matabueyes/Garrapata" may wrap after the slash, so a phone-width table fits. */
function breakAfterSlash(name: string): ReactNode {
  const parts = name.split("/");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

export function NaturaTable({ sites, metric: chosen, filters }: Props) {
  // A site has no area of its own to divide by (its figures are those of the
  // municipalities it touches), so MW per km² falls back to MW here.
  const metric = baseMetric(chosen);
  const coverageHeader = metric === "mw" ? "Con MW declarado" : metric === "ha" ? "Con superficie declarada" : null;
  const notice =
    filters.statuses.size === 0 ? (
      <p>Ningún estado seleccionado.</p>
    ) : filters.technologies.size === 0 ? (
      <p>Ninguna tecnología seleccionada.</p>
    ) : undefined;
  // Largest first; ties by project count, then by name (the loader's order).
  const rows = useMemo<Row[]>(
    () =>
      sites
        .map((s) => ({ ...s, value: metricValue(s.cells, metric, filters), ...metricCoverage(s.cells, metric, filters) }))
        .sort((a, b) => rank(b) - rank(a) || b.total - a.total),
    [sites, metric, filters],
  );
  const valueHeader = METRIC_LABELS[metric];
  return (
    <LookupTable
      id="natura"
      title="Red Natura 2000"
      countText={`${formatInt(sites.length)} espacios`}
      countTestId="natura-recuento"
      intro={
        <p>
          Suma de todos los proyectos de los municipios que tocan el espacio. Mide cercanía a escala municipal, no afección al espacio.
          {chosen === "densidad" ? " Con «MW por km²» la tabla muestra MW: la densidad se calcula sobre el término municipal o la provincia." : null}
        </p>
      }
      notice={notice}
      searchLabel="Buscar espacio"
      rows={rows}
      rowKey={(s) => s.siteCode}
      searchText={(s) => `${s.name} ${s.siteCode}`}
      emptyText="Ningún espacio coincide con la búsqueda."
      defaultSort={{ column: valueHeader, direction: "descending" }}
      columns={[
        { header: "Código", hideOnPhone: true, cell: (s) => <span className="dato">{s.siteCode}</span> },
        { header: "Espacio", rowHeader: true, cell: (s) => breakAfterSlash(s.name), sortValue: (s) => s.name },
        { header: "Tipo", hideOnPhone: true, cell: (s) => s.type, sortValue: (s) => s.type },
        { header: "Municipios", numeric: true, hideOnPhone: true, cell: (s) => formatInt(s.municipalityCount), sortValue: (s) => s.municipalityCount },
        {
          header: valueHeader,
          numeric: true,
          sortValue: rank,
          cell: (s) =>
            s.total === 0 ? <LookupNote>sin proyectos</LookupNote> : isUndeclared(s.declared, s.total) ? NO_DATA : formatMetric(s.value, metric),
        },
        ...(coverageHeader
          ? [
              {
                header: coverageHeader,
                numeric: true,
                sortValue: (s: Row) => (s.total === 0 ? -1 : s.declared / s.total),
                cell: (s: Row) => formatCoverageCell(s.declared, s.total),
              },
            ]
          : []),
        {
          // Each site has an Atom feed of the documents in the municipalities it touches.
          header: "Seguir",
          hideOnPhone: true,
          cell: (s) => (
            <a href={`/feeds/natura/${s.siteCode}.xml`} type="application/atom+xml" aria-label={`Seguir ${s.name} (RSS)`}>
              RSS
            </a>
          ),
        },
      ]}
    />
  );
}
