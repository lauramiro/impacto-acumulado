import type { Metadata } from "next";
import Link from "next/link";
import { loadMeta } from "@/lib/data/meta";
import { formatLongDate } from "@/lib/format";
import {
  CODE_LICENSE,
  CODE_LICENSE_URL,
  CONTACT_EMAIL,
  FUNDING_STATEMENT,
  PUBLISHER_NAME,
  PUBLISHER_URL,
  citationText,
} from "@/lib/publisher";
import { REPO_URL, SITE_URL } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Acerca de · Impacto Acumulado",
  description: "Quién mantiene Impacto Acumulado, cómo contactar, cómo se corrigen los errores, qué datos personales trata y cómo citarlo.",
};

export default async function AboutPage() {
  const meta = await loadMeta();
  const year = meta.generatedAt.getUTCFullYear();
  return (
    <article className={styles.page}>
      <h1>Acerca de</h1>
      <p>
        Impacto Acumulado es un registro público de las resoluciones ambientales de proyectos renovables en Andalucía, construido a
        partir del BOE y el BOJA. Está pensado para que lo cite quien lo necesite, sea cual sea su posición en un expediente.
      </p>

      <h2>Quién lo mantiene</h2>
      <p>
        Es un proyecto personal e independiente, mantenido por una persona a título individual, sin respaldo de ninguna institución.
      </p>
      {PUBLISHER_NAME ? (
        <p>
          El sitio lo mantiene y publica{" "}
          {PUBLISHER_URL ? (
            <a href={PUBLISHER_URL} rel="noopener">
              {PUBLISHER_NAME}
            </a>
          ) : (
            PUBLISHER_NAME
          )}
          .
        </p>
      ) : null}
      <p>
        El código está abierto en{" "}
        <a href={REPO_URL} rel="noopener">
          GitHub
        </a>
        {CODE_LICENSE ? (
          <>
            , con licencia{" "}
            {CODE_LICENSE_URL ? (
              <a href={CODE_LICENSE_URL} rel="license noopener">
                {CODE_LICENSE}
              </a>
            ) : (
              CODE_LICENSE
            )}
          </>
        ) : null}
        . Los datos se publican con licencia{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="license noopener">
          CC BY 4.0
        </a>
        .
      </p>

      <h2>Independencia y financiación</h2>
      <p>
        Todo dato procede de fuentes públicas oficiales, citadas en <Link href="/metodologia">Metodología</Link>. El sitio no recoge
        información de parte y no toma posición sobre si un proyecto debe aprobarse: muestra qué dicen los boletines, con su enlace, y
        cuánto se ha leído de forma automática, con el error medido.
      </p>
      {FUNDING_STATEMENT ? <p>{FUNDING_STATEMENT}</p> : null}

      <h2>Contacto</h2>
      <p>
        {CONTACT_EMAIL ? (
          <>
            Escribe a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, o abre un aviso en{" "}
          </>
        ) : (
          <>Abre un aviso en </>
        )}
        <a href={`${REPO_URL}/issues/new`} rel="noopener">
          GitHub
        </a>
        {CONTACT_EMAIL ? "" : " (hace falta una cuenta)"}.
      </p>

      <h2 id="correcciones">Correcciones</h2>
      <p>
        Cada página de municipio, proyecto y promotor tiene un enlace «¿Ves un error?» que prepara el aviso con la dirección de la
        página. Indica qué está mal y qué debería decir, con el enlace al anuncio del BOE o el BOJA si lo hay. El texto del boletín
        prevalece sobre lo que muestra el sitio: si difieren, es un error del sitio.
      </p>
      <p>
        Cuando un cambio altera los datos publicados, se anota en <Link href="/datos#cambios">Cambios</Link>, en la página de Datos,
        con su fecha.
      </p>

      <h2>Privacidad</h2>
      <p>
        El sitio no usa cookies, no carga analítica, no tiene cuentas de usuario y no guarda direcciones de correo. Los avisos de error
        pasan por GitHub y quedan bajo la cuenta de quien los envía. Los datos personales de las fuentes (listas de propietarios en
        anuncios del BOE) se descartan antes de guardar el texto y no se publican.
      </p>

      <h2>Cómo citar</h2>
      <p className={`dato ${styles.cita}`} data-testid="cita">
        {citationText({ year, date: formatLongDate(meta.generatedAt), url: `${SITE_URL}/datos` })}
      </p>
      <p>
        Si citas una cifra de un proyecto o un municipio, cita también el boletín y el anuncio que figuran en su página. Los archivos y
        la cita completa están en <Link href="/datos">Datos</Link>.
      </p>
    </article>
  );
}
