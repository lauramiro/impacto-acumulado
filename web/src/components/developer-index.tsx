"use client";

import Link from "next/link";
import { LookupTable } from "@/components/lookup-table";
import { formatInt, formatMw, NO_DATA } from "@/lib/format";

export type DeveloperRow = {
  key: string;
  name: string;
  /** Other printed forms, so a search for any of them finds the row. */
  names: string[];
  projects: number;
  accumulatingMw: number;
  accumulatingWithMw: number;
  refused: number;
  municipalities: number;
};

export function DeveloperIndex({ rows }: { rows: DeveloperRow[] }) {
  return (
    <LookupTable
      id="promotores"
      title="Todos los promotores"
      countText={`${formatInt(rows.length)} promotores`}
      countTestId="promotores-recuento"
      intro={
        <p>
          Cada sociedad que los boletines nombran como promotora, con sus distintas grafías unidas («S.L.» y «SL», mayúsculas,
          acentos). Un proyecto atribuido a varias sociedades cuenta en cada una.
        </p>
      }
      searchLabel="Buscar promotor"
      rows={rows}
      rowKey={(r) => r.key}
      searchText={(r) => r.names.join(" ")}
      emptyText="Ningún promotor coincide con la búsqueda."
      defaultSort={{ column: "Proyectos", direction: "descending" }}
      columns={[
        { header: "Promotor", rowHeader: true, cell: (r) => <Link href={`/promotor/${r.key}`}>{r.name}</Link>, sortValue: (r) => r.name },
        { header: "Proyectos", numeric: true, cell: (r) => formatInt(r.projects), sortValue: (r) => r.projects },
        {
          header: "MW aprobados o en trámite",
          numeric: true,
          cell: (r) => (r.accumulatingWithMw === 0 ? NO_DATA : formatMw(r.accumulatingMw)),
          sortValue: (r) => r.accumulatingMw,
        },
        { header: "Denegados o caducados", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.refused), sortValue: (r) => r.refused },
        { header: "Municipios", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.municipalities), sortValue: (r) => r.municipalities },
      ]}
    />
  );
}
