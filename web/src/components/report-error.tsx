import { REPO_URL, SITE_URL } from "@/lib/site";

/**
 * "¿Ves un error?": opens a prefilled GitHub issue for the page. An email
 * address for people without a GitHub account goes here when there is one.
 */
export function ReportError({ subject, path }: { subject: string; path: string }) {
  const body = [
    `Página: ${SITE_URL}${path}`,
    "",
    "Qué está mal:",
    "",
    "Qué debería decir, y dónde lo dice (enlace al anuncio del BOE o el BOJA, si lo hay):",
    "",
  ].join("\n");
  const href = `${REPO_URL}/issues/new?${new URLSearchParams({ title: `Error en ${subject}`, body })}`;
  return (
    <p className="pie">
      ¿Ves un error?{" "}
      <a href={href} rel="noopener">
        Avísanos
      </a>{" "}
      (abre un aviso en GitHub; hace falta una cuenta).
    </p>
  );
}
