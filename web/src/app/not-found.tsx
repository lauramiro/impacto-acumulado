import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada · Impacto Acumulado",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <article>
      <h1>Página no encontrada</h1>
      <p>No hay ningún municipio, proyecto ni página con esa dirección.</p>
      <p>
        <Link href="/">Volver al mapa</Link>
      </p>
    </article>
  );
}
