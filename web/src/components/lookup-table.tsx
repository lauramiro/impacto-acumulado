"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import { matches } from "@/lib/search";
import styles from "./lookup-table.module.css";

export type LookupColumn<R> = { header: string; cell: (r: R) => ReactNode; numeric?: boolean; rowHeader?: boolean; hiddenHeader?: boolean };

export type LookupTableProps<R> = {
  id: string;
  title: string;
  countText: string;
  countTestId: string;
  intro?: ReactNode;
  notice?: ReactNode;
  searchLabel: string;
  rows: readonly R[];
  rowKey: (r: R) => string;
  searchText: (r: R) => string;
  columns: LookupColumn<R>[];
  emptyText: string;
  rowClassName?: (r: R) => string | undefined;
};

export function LookupTable<R>(p: LookupTableProps<R>) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const visible = p.rows.filter((r) => matches(p.searchText(r), deferredQuery));
  return (
    <section aria-labelledby={p.id} className={styles.section}>
      <div className={styles.cabecera}>
        <h2 id={p.id}>{p.title}</h2>
        <p className={`dato ${styles.recuento}`} data-testid={p.countTestId}>
          {p.countText}
        </p>
      </div>
      {p.intro}
      {p.notice}
      <label className={styles.buscar}>
        {p.searchLabel}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <table className={styles.table}>
        <thead>
          <tr>
            {p.columns.map((c) => (
              <th key={c.header} scope="col" className={c.numeric ? styles.num : undefined}>
                {c.hiddenHeader ? <span className="visually-hidden">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={p.rowKey(r)} className={p.rowClassName?.(r)}>
              {p.columns.map((c) =>
                c.rowHeader ? (
                  <th key={c.header} scope="row">
                    {c.cell(r)}
                  </th>
                ) : (
                  <td key={c.header} className={c.numeric ? `dato ${styles.num}` : undefined}>
                    {c.cell(r)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && (!p.notice || deferredQuery.trim() !== "") ? <p className={styles.vacio}>{p.emptyText}</p> : null}
    </section>
  );
}
