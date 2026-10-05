import Link from "next/link";
import { Figure } from "@/components/figure";
import type { SplittingGroup } from "@/lib/data/splitting";
import { formatInt, formatMw } from "@/lib/format";
import type { Project } from "@/lib/types";
import styles from "./splitting-note.module.css";

/**
 * A neutral note on a group of sibling projects each under 50 MW that together
 * exceed it. It states the pattern and links the rule; it makes no legal claim.
 */
export function SplittingNote({ group, projects, current }: { group: SplittingGroup; projects: ReadonlyMap<number, Project>; current?: number }) {
  const members = group.projectIds.map((id) => projects.get(id)).filter((p) => p !== undefined);
  return (
    <aside className={styles.nota} aria-label="Posible fraccionamiento" data-testid="fraccionamiento">
      <p>
        <strong>Posible fraccionamiento.</strong> <Figure value={formatInt(members.length)} /> proyectos de promotores con el mismo
        nombre, en municipios iguales o vecinos y presentados en menos de dos años, declaran cada uno menos de 50 MW y suman{" "}
        <Figure value={formatMw(group.mwTotal)} />. Por encima de 50 MW autoriza el Estado, no la Junta. Es un patrón en los datos,
        no una conclusión: <Link href="/metodologia#fraccionamiento">cómo se detecta</Link>.
      </p>
      <ul>
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
    </aside>
  );
}
