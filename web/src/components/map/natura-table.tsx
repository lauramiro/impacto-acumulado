"use client";

import { LookupTable } from "@/components/lookup-table";
import { formatInt, formatNumber } from "@/lib/format";
import { METRIC_LABELS, METRIC_UNITS } from "@/lib/labels";
import { metricValue } from "@/lib/metrics";
import type { Filters, Metric, ProtectedAreaStats } from "@/lib/types";

type Props = { sites: readonly ProtectedAreaStats[]; metric: Metric; filters: Filters };

export function NaturaTable({ sites, metric, filters }: Props) {
  const decimals = metric === "proyectos" ? 0 : 1;
  return (
    <LookupTable
      id="natura"
      title="Red Natura 2000"
      countText={`${formatInt(sites.length)} espacios`}
      countTestId="natura-recuento"
      intro={<p>Suma de todos los proyectos de los municipios que tocan el espacio. Mide cercanía a escala municipal, no afección al espacio.</p>}
      searchLabel="Buscar espacio"
      rows={sites}
      rowKey={(s) => s.siteCode}
      searchText={(s) => `${s.name} ${s.siteCode}`}
      emptyText="Ningún espacio coincide con la búsqueda."
      columns={[
        { header: "Código", cell: (s) => <span className="dato">{s.siteCode}</span> },
        { header: "Espacio", rowHeader: true, cell: (s) => s.name },
        { header: "Tipo", cell: (s) => s.type },
        { header: "Municipios", numeric: true, cell: (s) => formatInt(s.municipalityCount) },
        {
          header: METRIC_LABELS[metric],
          numeric: true,
          cell: (s) => `${formatNumber(metricValue(s.cells, metric, filters), decimals)} ${METRIC_UNITS[metric]}`,
        },
      ]}
    />
  );
}
