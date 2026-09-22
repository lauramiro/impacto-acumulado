import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { Masthead } from "@/components/masthead";
import { Dateline } from "@/components/dateline";
import { loadMeta } from "@/lib/data/meta";
import "@/styles/globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], weight: ["500"], variable: "--font-display", display: "swap" });
const body = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body", display: "swap" });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data", display: "swap" });

export const metadata: Metadata = {
  title: "Impacto Acumulado",
  description:
    "Impacto ambiental acumulado de los proyectos renovables en Andalucía, construido a partir del BOE y el BOJA.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = await loadMeta();
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>
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
