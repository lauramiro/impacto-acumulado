"use client";

import Link from "next/link";
import { LookupTable } from "@/components/lookup-table";
import { formatCoverageCell, formatInt, isUndeclared, NO_DATA } from "@/lib/format";
import { formatMetric, METRIC_LABELS } from "@/lib/labels";
import type { Filters, MapMunicipality, Metric, Province } from "@/lib/types";

/** `declared`/`total`: how many of the matching projects declare the metric's figure, shown for MW and ha. */
export type IndexRow = MapMunicipality & { value: number; declared: number; total: number };

/** Sort key for the metric column: figures first, then municipalities whose projects declare none ("sin dato"). */
export function indexRank(r: IndexRow): number {
  return isUndeclared(r.declared, r.total) ? -1 : r.value;
}

const COVERAGE_HEADERS: Partial<Record<Metric, string>> = { mw: "Con MW declarado", ha: "Con superficie declarada" };

export type MunicipalityIndexProps = {
  rows: IndexRow[];
  metric: Metric;
  filters: Filters;
  selected: string | null;
  onSelect: (ine: string | null) => void;
  /** Province the rows are limited to, picked in the province table. */
  province: Province | null;
  onClearProvince: () => void;
};

export function MunicipalityIndex({ rows, metric, filters, selected, onSelect, province, onClearProvince }: MunicipalityIndexProps) {
  const notice =
    filters.statuses.size === 0 ? (
      <p>Ningún estado seleccionado.</p>
    ) : filters.technologies.size === 0 ? (
      <p>Ninguna tecnología seleccionada.</p>
    ) : undefined;
  const coverageHeader = COVERAGE_HEADERS[metric];
  return (
    <LookupTable
      id="indice"
      title="Índice de municipios"
      // With no status or technology the notice below says why the index is empty; a zero count would contradict it.
      countText={notice ? "" : `${formatInt(rows.length)} municipios con proyectos${province ? ` en la provincia de ${province}` : ""}`}
      countTestId="indice-recuento"
      intro={
        province ? (
          <p>
            <button type="button" className="ver-en-mapa" onClick={onClearProvince}>
              Toda Andalucía
            </button>
          </p>
        ) : undefined
      }
      notice={notice}
      searchLabel="Buscar municipio"
      rows={rows}
      rowKey={(r) => r.ine}
      searchText={(r) => r.name}
      emptyText="Ningún municipio coincide con la búsqueda."
      rowClassName={(r) => (selected === r.ine ? "seleccionada" : undefined)}
      defaultSort={{ column: METRIC_LABELS[metric], direction: "descending" }}
      columns={[
        { header: "Municipio", rowHeader: true, cell: (r) => <Link href={`/municipio/${r.ine}`}>{r.name}</Link>, sortValue: (r) => r.name },
        { header: "Provincia", hideOnPhone: true, cell: (r) => r.province, sortValue: (r) => r.province },
        {
          header: METRIC_LABELS[metric],
          numeric: true,
          cell: (r) => (isUndeclared(r.declared, r.total) ? NO_DATA : formatMetric(r.value, metric)),
          sortValue: indexRank,
        },
        ...(coverageHeader ? [{
              header: coverageHeader,
              numeric: true,
              cell: (r: IndexRow) => formatCoverageCell(r.declared, r.total),
              sortValue: (r: IndexRow) => r.declared / r.total,
            }] : []),
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
