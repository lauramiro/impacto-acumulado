import Link from "next/link";
import { Figure } from "@/components/figure";
import { familyLabel, type SplittingGroup } from "@/lib/data/splitting";
import { formatInt, formatMw } from "@/lib/format";
import type { Developer, Project } from "@/lib/types";
import styles from "./splitting-note.module.css";

/** What joins an infrastructure group: the evacuation projects that list its plants, or a substation their names share. */
function InfrastructureLine({ group, projects }: { group: SplittingGroup; projects: ReadonlyMap<number, Project> }) {
  const lines = (group.infrastructure?.projectIds ?? []).map((id) => projects.get(id)).filter((p) => p !== undefined);
  if (lines.length === 0) {
    return <p className="pie">Sus nombres citan la misma subestación.</p>;
  }
  return (
    <p className="pie" data-testid="fraccionamiento-infraestructura">
      {lines.length === 1 ? "Las nombra el proyecto de evacuación " : "Las nombran los proyectos de evacuación "}
      {lines.map((p, i) => (
        <span key={p.id}>
          {i > 0 ? (i === lines.length - 1 ? " y " : ", ") : null}
          <Link href={`/proyecto/${p.id}`}>{p.name}</Link>
        </span>
      ))}
      .
    </p>
  );
}

/**
 * A neutral note on the groups of projects, each under 50 MW, that together
 * exceed it: one section per page, the explanation once and a list per group.
 * A group is either sibling companies with one name or plants that share
 * evacuation infrastructure. It states the pattern and links the rule; it
 * makes no legal claim.
 */
export function SplittingNote({
  groups,
  projects,
  developers,
  current,
}: {
  groups: readonly SplittingGroup[];
  projects: ReadonlyMap<number, Project>;
  developers: readonly Developer[];
  current?: number;
}) {
  if (groups.length === 0) return null;
  return (
    <section className={styles.nota} aria-labelledby="fraccionamiento" data-testid="fraccionamiento">
      <h2 id="fraccionamiento">
        Posible fraccionamiento{" "}
        <span className="pie">
          ({formatInt(groups.length)} {groups.length === 1 ? "grupo" : "grupos"})
        </span>
      </h2>
      <p>
        Cada grupo reúne proyectos de promotores con el mismo nombre, o plantas que comparten infraestructura de evacuación (las nombra
        el mismo proyecto de evacuación o citan la misma subestación) sea cual sea su promotor, en municipios iguales o vecinos y
        presentados en menos de dos años, que declaran cada uno menos de 50 MW y juntos los superan. Por encima de 50 MW autoriza el
        Estado, no la Junta; los proyectos que evaluó el Ministerio no entran en ningún grupo. Es un patrón en los datos, no una
        conclusión: <Link href="/metodologia#fraccionamiento">cómo se detecta</Link>.
      </p>
      {groups.map((g) => {
        const id = `fraccionamiento-${g.projectIds.join("-")}`;
        const members = g.projectIds.map((pid) => projects.get(pid)).filter((p) => p !== undefined);
        return (
          <div key={`${g.kind}-${id}`} className={styles.grupo} data-testid="fraccionamiento-grupo" data-kind={g.kind}>
            <h3 id={id}>
              {familyLabel(g, developers)} · <Figure value={formatMw(g.mwTotal)} />{" "}
              <span className="pie">({formatInt(members.length)} proyectos)</span>
            </h3>
            {g.kind === "infraestructura" ? <InfrastructureLine group={g} projects={projects} /> : null}
            <ul aria-labelledby={id}>
              {members.map((p) =>
                p.id === current ? (
                  <li key={p.id}>
                    {p.name} <span className="pie">(este proyecto)</span>
                  </li>
                ) : (
                  <li key={p.id}>
                    <Link href={`/proyecto/${p.id}`}>{p.name}</Link>
                    {p.developer ? <span className="pie"> · {p.developer}</span> : null}
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
