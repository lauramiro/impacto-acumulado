import Link from "next/link";
import { MastheadNav } from "./masthead-nav";
import styles from "./masthead.module.css";

export function Masthead() {
  return (
    <div className={styles.masthead}>
      <Link href="/" className={`display ${styles.titulo}`}>
        Impacto Acumulado
      </Link>
      <MastheadNav />
    </div>
  );
}
