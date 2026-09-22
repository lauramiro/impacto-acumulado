"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { formatInt, formatNumber } from "@/lib/format";
import { METRIC_LABELS, METRIC_UNITS } from "@/lib/labels";
import { matches } from "@/lib/search";
import type { MapMunicipality, Metric } from "@/lib/types";
import styles from "./municipality-index.module.css";

export type IndexRow = MapMunicipality & { value: number };

export type MunicipalityIndexProps = {
  rows: IndexRow[];
  metric: Metric;
  selected: string | null;
  onSelect: (ine: string | null) => void;
};

export function MunicipalityIndex({ rows, metric, selected, onSelect }: MunicipalityIndexProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const visible = rows.filter((r) => matches(r.name, deferredQuery));
  const decimals = metric === "proyectos" ? 0 : 1;

  return (
    <section aria-labelledby="indice" className={styles.section}>
      <div className={styles.cabecera}>
        <h2 id="indice">Índice de municipios</h2>
        <p className={`dato ${styles.recuento}`} data-testid="indice-recuento">
          {formatInt(rows.length)} municipios con proyectos
        </p>
      </div>
      <label className={styles.buscar}>
        Buscar municipio
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Municipio</th>
            <th scope="col">Provincia</th>
            <th scope="col" className={styles.num}>{METRIC_LABELS[metric]}</th>
            <th scope="col">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.ine} className={selected === r.ine ? styles.seleccionada : undefined}>
              <th scope="row">
                <Link href={`/municipio/${r.ine}`}>{r.name}</Link>
              </th>
              <td>{r.province}</td>
              <td className={`dato ${styles.num}`}>
                {formatNumber(r.value, decimals)} {METRIC_UNITS[metric]}
              </td>
              <td>
                <button type="button" className={styles.ver} onClick={() => onSelect(r.ine)}>
                  Ver en el mapa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 ? <p className={styles.vacio}>Ningún municipio coincide con la búsqueda.</p> : null}
    </section>
  );
}
