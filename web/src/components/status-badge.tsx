import { STATUS_LABELS } from "@/lib/labels";
import type { Status } from "@/lib/types";
import styles from "./status-badge.module.css";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
