import Link from "next/link";
import { DeveloperLinks } from "@/components/developer-links";
import { Figure } from "@/components/figure";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatHa, formatInt, formatProjectMw } from "@/lib/format";
import { ROLE_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import type { GazetteDocument, Project } from "@/lib/types";
import styles from "./project-record.module.css";

const GAZETTE = { boe: "BOE", boja: "BOJA" } as const;

export function ProjectRecord({
  project,
  documents,
  developerKeys,
}: {
  project: Project;
  documents: GazetteDocument[];
  developerKeys: ReadonlyMap<string, string>;
}) {
  const figures = [
    formatProjectMw(project.mwNominal, project.mwPeak),
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
        <DeveloperLinks developer={project.developer} keys={developerKeys} /> · {TECHNOLOGY_LABELS[project.technology]}
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
          // The link names what the document is; the gazette reference, for citing, follows it.
          <li key={d.id}>
            <a href={d.url} rel="noopener">
              {d.role ? ROLE_LABELS[d.role] : "Documento"}
            </a>
            {d.verdict && d.verdict !== "no_aplica" ? ` · ${VERDICT_LABELS[d.verdict]}` : ""} · <span className="dato">{formatDate(d.publishedAt)}</span>{" "}
            <span className={`dato ${styles.ref}`}>
              {d.sourceId.startsWith(`${GAZETTE[d.source]}-`) ? d.sourceId : `${GAZETTE[d.source]} ${d.sourceId}`}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
