import Link from "next/link";
import { formatScore } from "@/lib/format";
import type { GazetteDocument } from "@/lib/types";
import styles from "./provenance.module.css";

export function Provenance({ statusDocument, latestDocument }: { statusDocument: GazetteDocument | null; latestDocument: GazetteDocument | null }) {
  return (
    <section aria-labelledby="procedencia" className={styles.section}>
      <h2 id="procedencia">Cómo se ha construido esta ficha</h2>
      <p>
        Los datos proceden de la lectura automática de los documentos anteriores con un modelo de lenguaje.{" "}
        {statusDocument
          ? `El estado lo fija la resolución marcada (${statusDocument.sourceId}).`
          : "Ningún documento resuelve el expediente; el estado queda sin determinar."}{" "}
        La potencia y la superficie son las del documento más reciente que las cita
        {latestDocument?.confidence !== null && latestDocument?.confidence !== undefined
          ? `; la confianza declarada por el modelo para ese documento es ${formatScore(latestDocument.confidence)}.`
          : "."}{" "}
        La precisión medida de la extracción está en <Link href="/metodologia">Metodología</Link>.
      </p>
    </section>
  );
}
