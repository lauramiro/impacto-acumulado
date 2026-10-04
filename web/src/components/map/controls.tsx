"use client";

import { useId, useMemo, useState } from "react";
import { formatInt } from "@/lib/format";
import { METRIC_LABELS, SENSITIVITY_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { splitBy } from "@/lib/metrics";
import { METRICS, SENSITIVITY_LAYERS, STATUSES, TECHNOLOGIES, type Metric, type SensitivityLayer, type StatsCell, type Status, type Technology } from "@/lib/types";
import styles from "./controls.module.css";

type Props = {
  metric: Metric;
  /** Andalucía cells, each project counted once: the source of the per-status project counts. */
  regionCells: readonly StatsCell[];
  statuses: ReadonlySet<Status>;
  technologies: ReadonlySet<Technology>;
  natura: boolean;
  sensitivity: SensitivityLayer;
  layerError: { natura: boolean; sensitivity: boolean };
  onMetric: (m: Metric) => void;
  onToggleStatus: (s: Status) => void;
  onStatuses: (s: ReadonlySet<Status>) => void;
  onToggleTechnology: (t: Technology) => void;
  onTechnologies: (t: ReadonlySet<Technology>) => void;
  onNatura: (on: boolean) => void;
  onSensitivity: (s: SensitivityLayer) => void;
};

/** "Todos los estados", "Ningún estado", one label, or "3 de 6 estados". */
function groupSummary<T extends string>(all: readonly T[], on: ReadonlySet<T>, labels: Record<T, string>, words: { all: string; none: string; some: string }) {
  const picked = all.filter((v) => on.has(v));
  if (picked.length === all.length) return words.all;
  if (picked.length === 0) return words.none;
  if (picked.length === 1) return labels[picked[0]];
  return `${picked.length} de ${all.length} ${words.some}`;
}

export function filterSummary(
  statuses: ReadonlySet<Status>,
  technologies: ReadonlySet<Technology>,
  natura: boolean,
  sensitivity: SensitivityLayer,
  listed: readonly Status[] = STATUSES,
) {
  const layers = [natura ? "Red Natura 2000" : null, sensitivity !== "ninguna" ? `Sensibilidad ${SENSITIVITY_LABELS[sensitivity].toLowerCase()}` : null].filter(Boolean);
  return [
    groupSummary(listed, statuses, STATUS_LABELS, { all: "Todos los estados", none: "Ningún estado", some: "estados" }),
    groupSummary(TECHNOLOGIES, technologies, TECHNOLOGY_LABELS, { all: "Todas las tecnologías", none: "Ninguna tecnología", some: "tecnologías" }),
    ...layers,
  ].join(" · ");
}

function Shortcuts<T>({ all, on, onSet, label }: { all: readonly T[]; on: ReadonlySet<T>; onSet: (s: ReadonlySet<T>) => void; label: string }) {
  return (
    <span className={styles.atajos}>
      <button type="button" className={styles.atajo} aria-label={`Marcar todos: ${label}`} disabled={on.size === all.length} onClick={() => onSet(new Set(all))}>
        todos
      </button>
      {" / "}
      <button type="button" className={styles.atajo} aria-label={`Desmarcar todos: ${label}`} disabled={on.size === 0} onClick={() => onSet(new Set())}>
        ninguno
      </button>
    </span>
  );
}

export function Controls({
  metric,
  regionCells,
  statuses,
  technologies,
  natura,
  sensitivity,
  layerError,
  onMetric,
  onToggleStatus,
  onStatuses,
  onToggleTechnology,
  onTechnologies,
  onNatura,
  onSensitivity,
}: Props) {
  // Below 768px Estado, Tecnología and Capas fold behind this toggle so the map
  // sits near the top of the first screen; wider screens always show them.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // A layer that failed to load keeps the panel open so its alert is seen.
  const shown = open || layerError.natura || layerError.sensitivity;
  // Projects per status for the ticked technologies (whatever the ticked
  // statuses), so a status with none (such as Favorable) says so on its
  // checkbox instead of silently changing nothing, and an unticked one still
  // shows what ticking it would add.
  const statusCounts = useMemo(() => {
    const by = splitBy(regionCells.filter((c) => technologies.has(c.technology)), "status");
    return new Map(STATUSES.map((s) => [s, by.get(s)?.projectCount ?? 0]));
  }, [regionCells, technologies]);
  // A status with no project anywhere in Andalucía (such as Favorable) cannot
  // match anything, so it gets no checkbox; a note names it instead, as the
  // province table does for its columns.
  const [listedStatuses, emptyStatuses] = useMemo(() => {
    const by = splitBy(regionCells, "status");
    const has = (s: Status) => (by.get(s)?.projectCount ?? 0) > 0;
    return [STATUSES.filter(has), STATUSES.filter((s) => !has(s))];
  }, [regionCells]);
  return (
    <div className={styles.controls}>
      <fieldset className={styles.group}>
        <legend>Métrica</legend>
        {METRICS.map((m) => (
          <label key={m} className={styles.option}>
            <input type="radio" name="metrica" value={m} checked={metric === m} onChange={() => onMetric(m)} />
            {METRIC_LABELS[m]}
          </label>
        ))}
      </fieldset>
      <button type="button" className={styles.plegar} aria-expanded={shown} aria-controls={panelId} onClick={() => setOpen(!shown)}>
        <span className={styles.plegarTitulo}>Filtros</span>
        <span className={styles.resumen} data-testid="resumen-filtros">
          {filterSummary(statuses, technologies, natura, sensitivity, listedStatuses)}
        </span>
      </button>
      <div id={panelId} className={`${styles.filtros} ${shown ? styles.abierto : ""}`}>
        <fieldset className={styles.group}>
          <legend>Estado</legend>
          {listedStatuses.map((s) => (
            <label key={s} className={styles.option}>
              <input type="checkbox" name="estado" value={s} checked={statuses.has(s)} onChange={() => onToggleStatus(s)} />
              {STATUS_LABELS[s]} <span className={styles.recuento}>({formatInt(statusCounts.get(s) ?? 0)})</span>
            </label>
          ))}
          <Shortcuts all={STATUSES} on={statuses} onSet={onStatuses} label="estados" />
          {emptyStatuses.length > 0 ? (
            <span className={styles.sinProyectos}>Sin proyectos en Andalucía: {emptyStatuses.map((s) => STATUS_LABELS[s]).join(", ")}</span>
          ) : null}
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Tecnología</legend>
          {TECHNOLOGIES.map((t) => (
            <label key={t} className={styles.option}>
              <input type="checkbox" name="tecnologia" value={t} checked={technologies.has(t)} onChange={() => onToggleTechnology(t)} />
              {TECHNOLOGY_LABELS[t]}
            </label>
          ))}
          <Shortcuts all={TECHNOLOGIES} on={technologies} onSet={onTechnologies} label="tecnologías" />
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Capas</legend>
          <label className={styles.option}>
            <input type="checkbox" name="natura" checked={natura} onChange={(e) => onNatura(e.target.checked)} />
            Red Natura 2000
          </label>
          {layerError.natura ? (
            <p role="alert" className={styles.error}>
              No se ha podido cargar la capa. Vuelve a intentarlo.
            </p>
          ) : null}
          <fieldset className={styles.subgroup}>
            <legend>Sensibilidad ambiental</legend>
            {SENSITIVITY_LAYERS.map((s) => (
              <label key={s} className={styles.option}>
                <input type="radio" name="sensibilidad" value={s} checked={sensitivity === s} onChange={() => onSensitivity(s)} />
                {SENSITIVITY_LABELS[s]}
              </label>
            ))}
          </fieldset>
          {layerError.sensitivity ? (
            <p role="alert" className={styles.error}>
              No se ha podido cargar la capa. Vuelve a intentarlo.
            </p>
          ) : null}
        </fieldset>
      </div>
    </div>
  );
}
