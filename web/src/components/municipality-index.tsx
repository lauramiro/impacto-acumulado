"use client";

import Link from "next/link";
import { LookupTable } from "@/components/lookup-table";
import { formatCoverageCell, formatInt, formatNumber } from "@/lib/format";
import { METRIC_LABELS, METRIC_UNITS } from "@/lib/labels";
import type { Filters, MapMunicipality, Metric } from "@/lib/types";

/** `withMw`/`total`: MW coverage under the active filters, shown when the metric is MW. */
export type IndexRow = MapMunicipality & { value: number; withMw: number; total: number };

export type MunicipalityIndexProps = {
  rows: IndexRow[];
  metric: Metric;
  filters: Filters;
  selected: string | null;
  onSelect: (ine: string | null) => void;
};

export function MunicipalityIndex({ rows, metric, filters, selected, onSelect }: MunicipalityIndexProps) {
  const decimals = metric === "proyectos" ? 0 : 1;
  const notice =
    filters.statuses.size === 0 ? (
      <p>Ningún estado seleccionado.</p>
    ) : filters.technologies.size === 0 ? (
      <p>Ninguna tecnología seleccionada.</p>
    ) : undefined;
  return (
    <LookupTable
      id="indice"
      title="Índice de municipios"
      countText={`${formatInt(rows.length)} municipios con proyectos`}
      countTestId="indice-recuento"
      notice={notice}
      searchLabel="Buscar municipio"
      rows={rows}
      rowKey={(r) => r.ine}
      searchText={(r) => r.name}
      emptyText="Ningún municipio coincide con la búsqueda."
      rowClassName={(r) => (selected === r.ine ? "seleccionada" : undefined)}
      columns={[
        { header: "Municipio", rowHeader: true, cell: (r) => <Link href={`/municipio/${r.ine}`}>{r.name}</Link> },
        { header: "Provincia", hideOnPhone: true, cell: (r) => r.province },
        { header: METRIC_LABELS[metric], numeric: true, cell: (r) => `${formatNumber(r.value, decimals)} ${METRIC_UNITS[metric]}` },
        ...(metric === "mw" ? [{ header: "Con MW declarado", numeric: true, cell: (r: IndexRow) => formatCoverageCell(r.withMw, r.total) }] : []),
        {
          header: "Acciones",
          hiddenHeader: true,
          cell: (r) => (
            <button type="button" className="ver-en-mapa" onClick={() => onSelect(r.ine)}>
              Ver en el mapa
            </button>
          ),
        },
      ]}
    />
  );
}
