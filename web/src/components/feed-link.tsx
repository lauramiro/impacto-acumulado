import styles from "./feed-link.module.css";

/**
 * A visible link to an Atom feed, with one line for people who have never
 * used one. No feed-to-email service is named: any of them works and none is endorsed.
 */
export function FeedLink({ href, label }: { href: string; label: string }) {
  return (
    <p className={styles.seguir}>
      <a href={href} type="application/atom+xml">
        {label} (RSS)
      </a>
      <span className={styles.ayuda}>
        {" "}
        · Avisa de cada documento nuevo en un lector de feeds; si no usas ninguno, un servicio gratuito de feed a correo te lo envía por
        email.
      </span>
    </p>
  );
}
