import Link from "next/link";
import { Figure } from "@/components/figure";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatHa, formatInt, formatMw } from "@/lib/format";
import { ROLE_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import type { GazetteDocument, Project } from "@/lib/types";
import styles from "./project-record.module.css";

export function ProjectRecord({ project, documents }: { project: Project; documents: GazetteDocument[] }) {
  const figures = [
    project.mwNominal !== null ? formatMw(project.mwNominal) : null,
    project.hectares !== null ? formatHa(project.hectares) : null,
    project.turbines !== null ? `${formatInt(project.turbines)} aerogeneradores` : null,
  ].filter((f): f is string => f !== null);
  return (
    <article className={styles.record}>
      <header className={styles.header}>
        <h3 className={styles.name}>
          <Link href={`/proyecto/${project.id}`}>{project.name}</Link>
        </h3>
        <StatusBadge status={project.status} />
      </header>
      <p className={styles.meta}>
        {project.developer ?? "Promotor no identificado"} · {TECHNOLOGY_LABELS[project.technology]}
        {figures.length > 0 ? (
          <>
            {" · "}
            <Figure value={figures.join(" · ")} />
          </>
        ) : null}
      </p>
      {project.ineCodes.length > 1 ? (
        <p className="pie">Proyecto situado en {project.ineCodes.length} municipios; cuenta íntegro en cada uno.</p>
      ) : null}
      <ul className={styles.docs}>
        {documents.map((d) => (
          <li key={d.id} className="dato">
            <a href={d.url} rel="noopener">{d.sourceId}</a> · {formatDate(d.publishedAt)}
            {d.role ? ` · ${ROLE_LABELS[d.role]}` : ""}
            {d.verdict && d.verdict !== "no_aplica" ? ` · ${VERDICT_LABELS[d.verdict]}` : ""}
          </li>
        ))}
      </ul>
    </article>
  );
}
