import { DeveloperLinks } from "@/components/developer-links";
import { StatusBadge } from "@/components/status-badge";
import { TECHNOLOGY_LABELS } from "@/lib/labels";
import type { Project } from "@/lib/types";
import styles from "./record-header.module.css";

export function RecordHeader({ project, developerKeys }: { project: Project; developerKeys: ReadonlyMap<string, string> }) {
  return (
    <header className={styles.header}>
      <p className={`dato ${styles.eyebrow}`}>
        <span>{TECHNOLOGY_LABELS[project.technology]}</span> <StatusBadge status={project.status} />
      </p>
      <h1 className={`display ${styles.nombre}`}>{project.name}</h1>
      <p className={styles.promotor}>
        <DeveloperLinks developer={project.developer} keys={developerKeys} />
      </p>
    </header>
  );
}
