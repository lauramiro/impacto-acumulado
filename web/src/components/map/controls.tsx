"use client";

import { METRIC_LABELS, SENSITIVITY_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { METRICS, SENSITIVITY_LAYERS, STATUSES, TECHNOLOGIES, type Metric, type SensitivityLayer, type Status, type Technology } from "@/lib/types";
import styles from "./controls.module.css";

type Props = {
  metric: Metric;
  statuses: ReadonlySet<Status>;
  technologies: ReadonlySet<Technology>;
  natura: boolean;
  sensitivity: SensitivityLayer;
  layerError: { natura: boolean; sensitivity: boolean };
  onMetric: (m: Metric) => void;
  onToggleStatus: (s: Status) => void;
  onToggleTechnology: (t: Technology) => void;
  onNatura: (on: boolean) => void;
  onSensitivity: (s: SensitivityLayer) => void;
};

export function Controls({
  metric,
  statuses,
  technologies,
  natura,
  sensitivity,
  layerError,
  onMetric,
  onToggleStatus,
  onToggleTechnology,
  onNatura,
  onSensitivity,
}: Props) {
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
      <fieldset className={styles.group}>
        <legend>Estado</legend>
        {STATUSES.map((s) => (
          <label key={s} className={styles.option}>
            <input type="checkbox" name="estado" value={s} checked={statuses.has(s)} onChange={() => onToggleStatus(s)} />
            {STATUS_LABELS[s]}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Tecnología</legend>
        {TECHNOLOGIES.map((t) => (
          <label key={t} className={styles.option}>
            <input type="checkbox" name="tecnologia" value={t} checked={technologies.has(t)} onChange={() => onToggleTechnology(t)} />
            {TECHNOLOGY_LABELS[t]}
          </label>
        ))}
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
  );
}
