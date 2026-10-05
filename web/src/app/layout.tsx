import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { Masthead } from "@/components/masthead";
import { Dateline } from "@/components/dateline";
import { loadMeta } from "@/lib/data/meta";
import { SITE_URL } from "@/lib/site";
import "@/styles/globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], weight: ["500"], variable: "--font-display", display: "swap" });
const body = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body", display: "swap" });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Impacto Acumulado: resoluciones ambientales de renovables en Andalucía",
  description:
    "Impacto ambiental acumulado de los proyectos renovables en Andalucía, construido a partir del BOE y el BOJA.",
  // "./" resolves against metadataBase to each route's own URL. A page that sets
  // its own `alternates` (the home page, for its feed) must repeat the canonical.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: "Impacto Acumulado",
    locale: "es_ES",
    url: "./",
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = await loadMeta();
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>
        {/* Home page sections; globals.css hides each link on pages without its target. */}
        <nav className="saltos" aria-label="Saltar a">
          <a href="#mapa">Mapa</a>
          <a href="#indice">Índice de municipios</a>
          <a href="#natura">Red Natura 2000</a>
        </nav>
        <header className="contenedor">
          <Masthead />
          <Dateline meta={meta} />
        </header>
        <main className="contenedor">{children}</main>
        <footer className="contenedor pie">
          <hr />
          <Dateline meta={meta} />
          <p>
            <a href="/metodologia">Metodología</a> · <a href="/datos">Datos</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
