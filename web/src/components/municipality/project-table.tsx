"use client";

import Link from "next/link";
import { Fragment } from "react";
import { LookupTable } from "@/components/lookup-table";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatInt, formatNumber, NO_DATA } from "@/lib/format";
import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import type { Status, Technology } from "@/lib/types";
import styles from "./project-table.module.css";

/** A project as the municipality table shows it; built on the server, so it is plain data. */
export type MunicipalityProjectRow = {
  id: number;
  name: string;
  developers: { name: string; key: string | null }[];
  technology: Technology;
  status: Status;
  /** Nominal MW, else the peak; null when neither is declared. */
  mw: number | null;
  peakOnly: boolean;
  /** Other municipalities the project also counts in, in full. */
  elsewhere: number;
  lastSeen: string;
  /** The newest gazette document, named by what it is, with its reference for citing. */
  lastDocument: { label: string; url: string; ref: string; date: string } | null;
  documentCount: number;
};

function Developers({ parts }: { parts: MunicipalityProjectRow["developers"] }) {
  if (parts.length === 0) return <>Promotor no identificado</>;
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={p.name}>
          {i > 0 ? "; " : null}
          {p.key ? <Link href={`/promotor/${p.key}`}>{p.name}</Link> : p.name}
        </Fragment>
      ))}
    </>
  );
}

/** The municipality's projects as a table to sort and search; the newest first, as the bulletins publish them. */
export function MunicipalityProjectTable({ rows }: { rows: MunicipalityProjectRow[] }) {
  return (
    <LookupTable
      id="proyectos"
      title={`Proyectos (${formatInt(rows.length)})`}
      countText={`${formatInt(rows.length)} ${rows.length === 1 ? "proyecto" : "proyectos"}`}
      countTestId="proyectos-municipio-recuento"
      intro={<p className={styles.intro}>Cada proyecto con su último anuncio en el boletín; la ficha del proyecto tiene todos sus documentos.</p>}
      searchLabel="Buscar proyecto o promotor"
      rows={rows}
      rowKey={(r) => String(r.id)}
      searchText={(r) => `${r.name} ${r.developers.map((d) => d.name).join(" ")}`}
      emptyText="Ningún proyecto coincide con la búsqueda."
      defaultSort={{ column: "Último anuncio", direction: "descending" }}
      columns={[
        {
          header: "Proyecto",
          rowHeader: true,
          cell: (r) => (
            <>
              <Link href={`/proyecto/${r.id}`}>{r.name}</Link>
              <span className={styles.detalle}>
                {TECHNOLOGY_LABELS[r.technology]}
                {r.elsewhere > 0 ? ` · cuenta íntegro también en ${formatInt(r.elsewhere)} ${r.elsewhere === 1 ? "municipio más" : "municipios más"}` : ""}
              </span>
              {/* On a phone the status sits under the name: a column of its own left the names a few letters wide. */}
              <span className={styles.estadoMovil}>
                <StatusBadge status={r.status} />
              </span>
            </>
          ),
          sortValue: (r) => r.name,
        },
        { header: "Promotor", hideOnPhone: true, cell: (r) => <Developers parts={r.developers} />, sortValue: (r) => r.developers[0]?.name ?? null },
        {
          header: "Estado",
          hideOnPhone: true,
          cell: (r) => (
            <span className={styles.estado}>
              <StatusBadge status={r.status} />
            </span>
          ),
          sortValue: (r) => STATUS_LABELS[r.status],
        },
        {
          header: "MW",
          numeric: true,
          cell: (r) =>
            r.technology === "linea_evacuacion" ? (
              <span className={styles.linea}>línea</span>
            ) : (
              <>
                {r.mw === null ? NO_DATA : <>{formatNumber(r.mw, 1)}<span className={styles.unidad}> MW</span></>}{" "}
                <span className={styles.sufijo}>{r.peakOnly ? "pico" : ""}</span>
              </>
            ),
          sortValue: (r) => (r.technology === "linea_evacuacion" ? null : r.mw),
        },
        {
          header: "Último anuncio",
          hideOnPhone: true,
          cell: (r) =>
            r.lastDocument ? (
              <span className={styles.documento}>
                <a href={r.lastDocument.url} rel="noopener">
                  {r.lastDocument.label}
                </a>{" "}
                <span className={styles.cita}>
                  <span className="dato">{formatDate(r.lastDocument.date)}</span> · <span className="dato">{r.lastDocument.ref}</span>
                  {r.documentCount > 1 ? ` · ${formatInt(r.documentCount)} documentos en la ficha` : null}
                </span>
              </span>
            ) : (
              <span className="dato">{formatDate(r.lastSeen)}</span>
            ),
          sortValue: (r) => r.lastSeen,
        },
      ]}
    />
  );
}
