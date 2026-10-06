"use client";

import Link from "next/link";
import { LookupTable } from "@/components/lookup-table";
import type { RollupRow } from "@/lib/developers";
import styles from "./developer-index.module.css";
import { absenceMark, formatInt, formatMw, NO_PROJECTS } from "@/lib/format";

export type DeveloperRow = {
  key: string;
  name: string;
  /** Other printed forms, so a search for any of them finds the row. */
  names: string[];
  projects: number;
  accumulatingMw: number;
  accumulatingWithMw: number;
  /** Projects with no verdict in the bulletin: in neither the MW column nor the refused one. */
  noVerdict: number;
  refused: number;
  municipalities: number;
};

/** Approved or pending projects: every project not counted as refused, lapsed or with no verdict (developerTotals splits them that way). */
const accumulatingProjects = (r: DeveloperRow) => r.projects - r.refused - r.noVerdict;

/** NO_PROJECTS with no approved or pending projects, NO_DATA when none of them declares MW, else null. */
export function developerMwMark(r: DeveloperRow) {
  return absenceMark(r.accumulatingWithMw, accumulatingProjects(r));
}

/** A missing figure ranks after every real one, so a sort by MW starts with a number in either direction. */
export function developerMwSort(r: DeveloperRow): number | null {
  return developerMwMark(r) === null ? r.accumulatingMw : null;
}

function MwCell({ r }: { r: DeveloperRow }) {
  const mark = developerMwMark(r);
  if (mark === null) return formatMw(r.accumulatingMw);
  // "–" read out as words: a screen reader may skip the dash.
  return mark === NO_PROJECTS ? (
    <>
      <span aria-hidden="true">{NO_PROJECTS}</span>
      <span className="visually-hidden">ningún proyecto aprobado o en trámite</span>
    </>
  ) : (
    mark
  );
}

export function DeveloperRollupIndex({ rows }: { rows: RollupRow[] }) {
  return (
    <LookupTable
      id="grupos"
      title="Por grupo o familia de nombres"
      countText={`${formatInt(rows.length)} grupos y familias`}
      countTestId="grupos-recuento"
      intro={
        <p>
          Las sociedades sumadas: las de un grupo empresarial cuando una fuente lo dice (la matriz enlaza a la fuente) y las que solo
          cambian en el número final del nombre (una familia de nombres, como Arena Power Ren 5 y Arena Power Ren 22). Una familia es
          un patrón de nombres habitual en sociedades creadas para un solo proyecto; no está comprobado que pertenezcan al mismo
          grupo. Cada proyecto cuenta una vez en cada fila.
        </p>
      }
      searchLabel="Buscar grupo o familia"
      rows={rows}
      rowKey={(r) => `${r.kind}-${r.key}`}
      searchText={(r) => [r.name, r.parentCompany ?? "", ...r.names].join(" ")}
      emptyText="Ningún grupo ni familia coincide con la búsqueda."
      defaultSort={{ column: "Proyectos", direction: "descending" }}
      columns={[
        {
          header: "Grupo o familia",
          rowHeader: true,
          // On a phone the Matriz column is hidden; a group with a source shows it under the name.
          cell: (r) => (
            <>
              <Link href={`/promotor/${r.key}`}>{r.name}</Link>
              {r.parentCompany && r.sourceUrl ? (
                <span className={styles.matrizMovil}>
                  Matriz:{" "}
                  <a href={r.sourceUrl} rel="noopener">
                    {r.parentCompany}
                  </a>
                </span>
              ) : null}
            </>
          ),
          sortValue: (r) => r.name,
        },
        {
          header: "Matriz",
          hideOnPhone: true,
          cell: (r) =>
            r.parentCompany && r.sourceUrl ? (
              <a href={r.sourceUrl} rel="noopener">
                {r.parentCompany}
              </a>
            ) : (
              <span className="pie">familia de nombres, sin fuente</span>
            ),
          sortValue: (r) => r.parentCompany,
        },
        // Hidden on a phone: with it the table cleared 390 px by a few pixels on one
        // platform's fonts and overflowed on another's.
        { header: "Sociedades", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.companies), sortValue: (r) => r.companies },
        { header: "Proyectos", numeric: true, cell: (r) => formatInt(r.projects), sortValue: (r) => r.projects },
        { header: "MW aprobados o en trámite", numeric: true, cell: (r) => <MwCell r={r} />, sortValue: developerMwSort },
        { header: "Sin veredicto", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.noVerdict), sortValue: (r) => r.noVerdict },
        { header: "Municipios", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.municipalities), sortValue: (r) => r.municipalities },
      ]}
    />
  );
}

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
          cell: (r) => <MwCell r={r} />,
          sortValue: developerMwSort,
        },
        { header: "Sin veredicto", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.noVerdict), sortValue: (r) => r.noVerdict },
        { header: "Denegados o caducados", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.refused), sortValue: (r) => r.refused },
        { header: "Municipios", numeric: true, hideOnPhone: true, cell: (r) => formatInt(r.municipalities), sortValue: (r) => r.municipalities },
      ]}
    />
  );
}
