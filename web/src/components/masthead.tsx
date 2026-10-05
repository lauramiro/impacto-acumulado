import Link from "next/link";
import styles from "./masthead.module.css";

export function Masthead() {
  return (
    <div className={styles.masthead}>
      <Link href="/" className={`display ${styles.titulo}`}>
        Impacto Acumulado
      </Link>
      <nav className={styles.secciones} aria-label="Secciones">
        <Link href="/">Mapa</Link>
        <Link href="/promotores">Promotores</Link>
        <Link href="/metodologia">Metodología</Link>
        <Link href="/datos">Datos</Link>
      </nav>
    </div>
  );
}
