"use client";

import Link from "next/link";
import { LookupTable } from "@/components/lookup-table";
import { formatInt, formatNumber } from "@/lib/format";
import { METRIC_LABELS, METRIC_UNITS } from "@/lib/labels";
import type { MapMunicipality, Metric } from "@/lib/types";

export type IndexRow = MapMunicipality & { value: number };

export type MunicipalityIndexProps = {
  rows: IndexRow[];
  metric: Metric;
  selected: string | null;
  onSelect: (ine: string | null) => void;
};

export function MunicipalityIndex({ rows, metric, selected, onSelect }: MunicipalityIndexProps) {
  const decimals = metric === "proyectos" ? 0 : 1;
  return (
    <LookupTable
      id="indice"
      title="Índice de municipios"
      countText={`${formatInt(rows.length)} municipios con proyectos`}
      countTestId="indice-recuento"
      searchLabel="Buscar municipio"
      rows={rows}
      rowKey={(r) => r.ine}
      searchText={(r) => r.name}
      emptyText="Ningún municipio coincide con la búsqueda."
      rowClassName={(r) => (selected === r.ine ? "seleccionada" : undefined)}
      columns={[
        { header: "Municipio", rowHeader: true, cell: (r) => <Link href={`/municipio/${r.ine}`}>{r.name}</Link> },
        { header: "Provincia", cell: (r) => r.province },
        { header: METRIC_LABELS[metric], numeric: true, cell: (r) => `${formatNumber(r.value, decimals)} ${METRIC_UNITS[metric]}` },
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
