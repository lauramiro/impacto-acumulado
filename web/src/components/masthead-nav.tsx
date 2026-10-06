"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./masthead.module.css";

/** Each section, and the record pages that belong to it: a municipality is reached from the map. */
const SECTIONS = [
  { href: "/", label: "Mapa", children: "/municipio/" },
  { href: "/proyectos", label: "Proyectos", children: "/proyecto/" },
  { href: "/promotores", label: "Promotores", children: "/promotor/" },
  { href: "/resultados", label: "Resultados" },
  { href: "/metodologia", label: "Metodología" },
  { href: "/datos", label: "Datos" },
] as const;

/** The section links; the one the reader is in is marked, as the page itself or as its section. */
export function MastheadNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.secciones} aria-label="Secciones">
      {SECTIONS.map((s) => {
        const current = pathname === s.href ? "page" : "children" in s && pathname.startsWith(s.children) ? "true" : undefined;
        return (
          <Link key={s.href} href={s.href} aria-current={current}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
