"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LookupTable } from "@/components/lookup-table";
import { StatusBadge } from "@/components/status-badge";
import { formatInt, formatMw, NO_DATA } from "@/lib/format";
import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { projectSearchText, statusesPresent, type ProjectRow } from "@/lib/project-index";
import type { Status } from "@/lib/types";
import styles from "./project-index.module.css";

/** MW as the project page reads it: the nominal figure, else the peak (marked), else no figure. */
function mwCell(r: ProjectRow): string {
  if (r.mwNominal !== null) return formatMw(r.mwNominal);
  return r.mwPeak !== null ? `${formatMw(r.mwPeak)} pico` : NO_DATA;
}

const mwSort = (r: ProjectRow) => r.mwNominal ?? r.mwPeak;

export function ProjectIndex({ rows }: { rows: ProjectRow[] }) {
  const present = useMemo(() => statusesPresent(rows), [rows]);
  // Every status is on and the order is alphabetical: this is a list to look projects up in, not a ranking, so a refused project is as findable as an approved one.
  const [on, setOn] = useState<ReadonlySet<Status>>(() => new Set(present));
  const [query, setQuery] = useState("");

  // The search is deep-linkable (/proyectos?q=AAU/HU/057/21). Read after mount: the page is static, so the server cannot see it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setQuery(q);
  }, []);

  function changeQuery(q: string) {
    setQuery(q);
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }

  const counts = useMemo(() => {
    const out = new Map<Status, number>();
    for (const r of rows) out.set(r.status, (out.get(r.status) ?? 0) + 1);
    return out;
  }, [rows]);
  const shown = useMemo(() => rows.filter((r) => on.has(r.status)), [rows, on]);
  const allOn = on.size === present.length;

  function toggle(s: Status) {
    const next = new Set(on);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setOn(next);
  }

  return (
    <LookupTable
      id="proyectos"
      title="Todos los proyectos"
      countText={`${formatInt(shown.length)} proyectos${allOn ? "" : ` de ${formatInt(rows.length)}`}`}
      countTestId="proyectos-recuento"
      query={query}
      onQueryChange={changeQuery}
      intro={
        <>
          <p>
            Cada proyecto con su ficha: busca por nombre, promotor o número de expediente (por ejemplo, AAU/HU/057/21). Un proyecto puede llevar
            varios números de expediente, uno por documento.
          </p>
          <fieldset className={styles.estados}>
            <legend>Estado</legend>
            {present.map((s) => (
              <label key={s} className={styles.opcion}>
                <input type="checkbox" name="estado" checked={on.has(s)} onChange={() => toggle(s)} />
                {STATUS_LABELS[s]} <span className={styles.recuento}>({formatInt(counts.get(s) ?? 0)})</span>
              </label>
            ))}
          </fieldset>
        </>
      }
      searchLabel="Buscar proyecto"
      rows={shown}
      rowKey={(r) => String(r.id)}
      searchText={projectSearchText}
      emptyText="Ningún proyecto coincide con la búsqueda."
      defaultSort={{ column: "Proyecto", direction: "ascending" }}
      columns={[
        { header: "Proyecto", rowHeader: true, cell: (r) => <Link href={`/proyecto/${r.id}`}>{r.name}</Link>, sortValue: (r) => r.name },
        { header: "Promotor", hideOnPhone: true, cell: (r) => r.developer ?? NO_DATA, sortValue: (r) => r.developer },
        {
          header: "Expediente",
          hideOnPhone: true,
          cell: (r) => (r.expedientes.length > 0 ? r.expedientes.join(" · ") : NO_DATA),
          sortValue: (r) => r.expedientes[0] ?? null,
        },
        { header: "Tecnología", hideOnPhone: true, cell: (r) => TECHNOLOGY_LABELS[r.technology], sortValue: (r) => TECHNOLOGY_LABELS[r.technology] },
        { header: "Estado", cell: (r) => (
            <span className={styles.estado}>
              <StatusBadge status={r.status} />
            </span>
          ), sortValue: (r) => STATUS_LABELS[r.status] },
        { header: "MW", numeric: true, cell: mwCell, sortValue: mwSort },
      ]}
    />
  );
}
