import Link from "next/link";
import { Figure } from "@/components/figure";
import { familyLabel, type SplittingGroup } from "@/lib/data/splitting";
import { formatInt, formatMw } from "@/lib/format";
import type { Developer, Project } from "@/lib/types";
import styles from "./splitting-note.module.css";

/**
 * A neutral note on the groups of sibling projects, each under 50 MW, that
 * together exceed it: one section per page, the explanation once and a list
 * per group. It states the pattern and links the rule; it makes no legal claim.
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
        Cada grupo reúne proyectos de promotores con el mismo nombre, en municipios iguales o vecinos y presentados en menos de dos
        años, que declaran cada uno menos de 50 MW y juntos los superan. Por encima de 50 MW autoriza el Estado, no la Junta; los
        proyectos que evaluó el Ministerio no entran en ningún grupo. Es un patrón en los datos, no una conclusión:{" "}
        <Link href="/metodologia#fraccionamiento">cómo se detecta</Link>.
      </p>
      {groups.map((g) => {
        const id = `fraccionamiento-${g.projectIds.join("-")}`;
        const members = g.projectIds.map((pid) => projects.get(pid)).filter((p) => p !== undefined);
        return (
          <div key={id} className={styles.grupo} data-testid="fraccionamiento-grupo">
            <h3 id={id}>
              {familyLabel(g, developers)} · <Figure value={formatMw(g.mwTotal)} />{" "}
              <span className="pie">({formatInt(members.length)} proyectos)</span>
            </h3>
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
