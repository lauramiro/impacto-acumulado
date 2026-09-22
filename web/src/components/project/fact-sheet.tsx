import Link from "next/link";
import { Figure } from "@/components/figure";
import { formatDate, formatHa, formatInt, formatMw } from "@/lib/format";
import type { Municipality, Project } from "@/lib/types";
import styles from "./fact-sheet.module.css";

const EMPTY = "—";

export function FactSheet({ project, municipalities }: { project: Project; municipalities: Municipality[] }) {
  const cell = (v: number | null, f: (n: number) => string) => <Figure value={v === null ? EMPTY : f(v)} />;
  return (
    <section aria-labelledby="ficha" className={styles.section}>
      <h2 id="ficha">Ficha</h2>
      <dl className={styles.grid}>
        <dt>Potencia nominal</dt>
        <dd>{cell(project.mwNominal, formatMw)}</dd>
        <dt>Superficie</dt>
        <dd>{cell(project.hectares, formatHa)}</dd>
        <dt>Potencia pico</dt>
        <dd>{cell(project.mwPeak, formatMw)}</dd>
        <dt>Aerogeneradores</dt>
        <dd>{cell(project.turbines, formatInt)}</dd>
        <dt>Municipios</dt>
        <dd>
          {municipalities.length === 0 ? (
            EMPTY
          ) : (
            <ul className={styles.municipios}>
              {municipalities.map((m) => (
                <li key={m.ine}>
                  <Link href={`/municipio/${m.ine}`}>
                    {m.name} ({m.province})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Primera publicación</dt>
        <dd>
          <Figure value={formatDate(project.firstSeen)} />
        </dd>
        <dt>Última publicación</dt>
        <dd>
          <Figure value={formatDate(project.lastSeen)} />
        </dd>
      </dl>
    </section>
  );
}
