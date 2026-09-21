import Link from "next/link";

export default function NotFound() {
  return (
    <article>
      <h1>Página no encontrada</h1>
      <p>No hay ningún municipio ni página con esa dirección.</p>
      <p>
        <Link href="/">Volver al mapa</Link>
      </p>
    </article>
  );
}
