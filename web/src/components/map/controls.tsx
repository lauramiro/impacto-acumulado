"use client";

import { METRIC_LABELS, STATUS_LABELS } from "@/lib/labels";
import { METRICS, STATUSES, type Metric, type Status } from "@/lib/types";
import styles from "./controls.module.css";

type Props = {
  metric: Metric;
  statuses: ReadonlySet<Status>;
  onMetric: (m: Metric) => void;
  onToggleStatus: (s: Status) => void;
};

export function Controls({ metric, statuses, onMetric, onToggleStatus }: Props) {
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
    </div>
  );
}
