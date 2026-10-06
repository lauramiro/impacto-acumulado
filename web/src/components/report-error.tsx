import { CONTACT_EMAIL } from "@/lib/publisher";
import { REPO_URL, SITE_URL } from "@/lib/site";

/**
 * "¿Ves un error?": opens a prefilled GitHub issue for the page, or, when the
 * publisher has set a contact email (lib/publisher.ts), a prefilled email for
 * people without a GitHub account.
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
  const title = `Error en ${subject}`;
  const href = `${REPO_URL}/issues/new?${new URLSearchParams({ title, body })}`;
  const mailto = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}?${new URLSearchParams({ subject: title, body }).toString().replace(/\+/g, "%20")}` : null;
  return (
    <p className="pie">
      ¿Ves un error?{" "}
      <a href={href} rel="noopener">
        Avísanos
      </a>{" "}
      {mailto ? (
        <>
          (abre un aviso en GitHub; hace falta una cuenta) o{" "}
          <a href={mailto}>escríbenos por correo</a>.
        </>
      ) : (
        "(abre un aviso en GitHub; hace falta una cuenta)."
      )}
    </p>
  );
}
