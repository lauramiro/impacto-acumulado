"use client";

import { LookupTable } from "@/components/lookup-table";
import { formatCoverageCell, formatInt, isUndeclared, NO_DATA } from "@/lib/format";
import { formatMetric, METRIC_LABELS } from "@/lib/labels";
import { metricCoverage, metricValue } from "@/lib/metrics";
import type { Filters, Metric, ProtectedAreaStats } from "@/lib/types";

type Props = { sites: readonly ProtectedAreaStats[]; metric: Metric; filters: Filters };

export function NaturaTable({ sites, metric, filters }: Props) {
  const coverageHeader = metric === "mw" ? "Con MW declarado" : metric === "ha" ? "Con superficie declarada" : null;
  const notice =
    filters.statuses.size === 0 ? (
      <p>Ningún estado seleccionado.</p>
    ) : filters.technologies.size === 0 ? (
      <p>Ninguna tecnología seleccionada.</p>
    ) : undefined;
  return (
    <LookupTable
      id="natura"
      title="Red Natura 2000"
      countText={`${formatInt(sites.length)} espacios`}
      countTestId="natura-recuento"
      intro={<p>Suma de todos los proyectos de los municipios que tocan el espacio. Mide cercanía a escala municipal, no afección al espacio.</p>}
      notice={notice}
      searchLabel="Buscar espacio"
      rows={sites}
      rowKey={(s) => s.siteCode}
      searchText={(s) => `${s.name} ${s.siteCode}`}
      emptyText="Ningún espacio coincide con la búsqueda."
      columns={[
        { header: "Código", hideOnPhone: true, cell: (s) => <span className="dato">{s.siteCode}</span> },
        { header: "Espacio", rowHeader: true, cell: (s) => s.name },
        { header: "Tipo", hideOnPhone: true, cell: (s) => s.type },
        { header: "Municipios", numeric: true, hideOnPhone: true, cell: (s) => formatInt(s.municipalityCount) },
        {
          header: METRIC_LABELS[metric],
          numeric: true,
          cell: (s) => {
            const c = metricCoverage(s.cells, metric, filters);
            return isUndeclared(c.declared, c.total) ? NO_DATA : formatMetric(metricValue(s.cells, metric, filters), metric);
          },
        },
        ...(coverageHeader
          ? [
              {
                header: coverageHeader,
                numeric: true,
                cell: (s: ProtectedAreaStats) => {
                  const c = metricCoverage(s.cells, metric, filters);
                  return formatCoverageCell(c.declared, c.total);
                },
              },
            ]
          : []),
      ]}
    />
  );
}
