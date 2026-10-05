"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import { formatInt } from "@/lib/format";
import { matches } from "@/lib/search";
import styles from "./lookup-table.module.css";

/**
 * `hideOnPhone`: drop the column below 768 px so the table fits without horizontal scroll.
 * `sortValue`: makes the header a sort button; numbers sort largest first, text A to Z.
 * A null value (no figure to rank) sorts last in either direction.
 */
export type LookupColumn<R> = {
  header: string;
  cell: (r: R) => ReactNode;
  numeric?: boolean;
  rowHeader?: boolean;
  hiddenHeader?: boolean;
  hideOnPhone?: boolean;
  sortValue?: (r: R) => SortValue;
};

type SortValue = number | string | null;
type Direction = "ascending" | "descending";
export type LookupSort = { column: string; direction: Direction };

function cellClass(c: { numeric?: boolean; hideOnPhone?: boolean }, numericClass: string): string | undefined {
  return [c.numeric ? numericClass : null, c.hideOnPhone ? styles.sinMovil : null].filter(Boolean).join(" ") || undefined;
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function compare(a: number | string, b: number | string): number {
  return typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
}

/** `rows` ordered by `value`, nulls last whatever the direction; stable, so ties keep their order. */
export function sortRows<R>(rows: readonly R[], value: (r: R) => SortValue, direction: Direction): R[] {
  const sign = direction === "ascending" ? 1 : -1;
  return rows
    .map((r) => ({ r, v: value(r) }))
    .sort((a, b) => (a.v === null || b.v === null ? Number(a.v === null) - Number(b.v === null) : sign * compare(a.v, b.v)))
    .map((x) => x.r);
}

/** Rows shown before "Ver todos"; the rest are not rendered, on the server or the client. */
const FIRST_ROWS = 20;

export type LookupTableProps<R> = {
  id: string;
  title: string;
  /** "151 municipios con proyectos"; while a search is active it reads "1 de 151 municipios con proyectos". */
  countText: string;
  countTestId: string;
  intro?: ReactNode;
  notice?: ReactNode;
  searchLabel: string;
  /** In the order they are shown when `defaultSort` is in effect; sorting is stable, so it breaks ties. */
  rows: readonly R[];
  rowKey: (r: R) => string;
  searchText: (r: R) => string;
  columns: LookupColumn<R>[];
  defaultSort?: LookupSort;
  emptyText: string;
  rowClassName?: (r: R) => string | undefined;
  /** Optional: the search text held by the caller (to put it in the URL); the table keeps its own when absent. */
  query?: string;
  onQueryChange?: (q: string) => void;
};

export function LookupTable<R>(p: LookupTableProps<R>) {
  const [ownQuery, setOwnQuery] = useState("");
  const query = p.query ?? ownQuery;
  const setQuery = (q: string) => (p.onQueryChange ? p.onQueryChange(q) : setOwnQuery(q));
  const [sort, setSort] = useState<LookupSort | null>(null);
  const [all, setAll] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim() !== "";
  // A chosen column can disappear when the metric changes; the default order takes over.
  const sortable = (s: LookupSort | null | undefined) => (s ? p.columns.find((c) => c.header === s.column && c.sortValue) : undefined);
  const active = (sortable(sort) ? sort : p.defaultSort) ?? null;
  const sortColumn = sortable(active);

  const found = p.rows.filter((r) => matches(p.searchText(r), deferredQuery));
  const sortValue = sortColumn?.sortValue;
  const matched = sortValue && active ? sortRows(found, sortValue, active.direction) : found;

  const shown = all ? matched : matched.slice(0, FIRST_ROWS);
  const tableId = `${p.id}-tabla`;

  function sortBy(c: LookupColumn<R>) {
    const direction: Direction =
      active?.column === c.header ? (active.direction === "ascending" ? "descending" : "ascending") : c.numeric ? "descending" : "ascending";
    setSort({ column: c.header, direction });
  }

  return (
    <section aria-labelledby={p.id} className={styles.section}>
      <div className={styles.cabecera}>
        <h2 id={p.id}>{p.title}</h2>
        <p className={`dato ${styles.recuento}`} data-testid={p.countTestId} aria-live="polite">
          {searching ? `${formatInt(matched.length)} de ${p.countText}` : p.countText}
        </p>
      </div>
      {p.intro}
      {p.notice}
      <label className={styles.buscar}>
        {p.searchLabel}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <table className={styles.table} id={tableId}>
        <thead>
          <tr>
            {p.columns.map((c) => {
              const sorted = active?.column === c.header && c.sortValue ? active.direction : undefined;
              return (
                <th key={c.header} scope="col" className={cellClass(c, styles.num)} aria-sort={sorted}>
                  {c.hiddenHeader ? (
                    <span className="visually-hidden">{c.header}</span>
                  ) : c.sortValue ? (
                    <button type="button" className={styles.ordenar} onClick={() => sortBy(c)}>
                      {c.header}{" "}
                      <span aria-hidden="true" className={styles.flecha}>
                        {sorted === "ascending" ? "▲" : sorted === "descending" ? "▼" : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={p.rowKey(r)} className={p.rowClassName?.(r)}>
              {p.columns.map((c) =>
                c.rowHeader ? (
                  <th key={c.header} scope="row" className={cellClass(c, styles.num)}>
                    {c.cell(r)}
                  </th>
                ) : (
                  <td key={c.header} className={cellClass(c, `dato ${styles.num}`)}>
                    {c.cell(r)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {matched.length > FIRST_ROWS ? (
        <p className={styles.mas}>
          <button type="button" className="ver-en-mapa" aria-controls={tableId} aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? `Ver solo los ${formatInt(FIRST_ROWS)} primeros` : `Ver todos (${formatInt(matched.length)})`}
          </button>
        </p>
      ) : null}
      {matched.length === 0 && (!p.notice || searching) ? <p className={styles.vacio}>{p.emptyText}</p> : null}
    </section>
  );
}

/** A cell that states an absence ("sin proyectos") rather than a figure. */
export function LookupNote({ children }: { children: ReactNode }) {
  return <span className={styles.sinProyectos}>{children}</span>;
}
