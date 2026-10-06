import Link from "next/link";
import { MastheadNav } from "./masthead-nav";
import { SiteSearch } from "./site-search";
import styles from "./masthead.module.css";

export function Masthead() {
  return (
    <div className={styles.masthead}>
      <Link href="/" className={`display ${styles.titulo}`}>
        Impacto Acumulado
      </Link>
      {/* The search above the sections on a wide screen; on a phone it takes the full width under the title. */}
      <div className={styles.derecha}>
        <SiteSearch />
        <MastheadNav />
      </div>
    </div>
  );
}
