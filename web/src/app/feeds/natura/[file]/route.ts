import { loadFeedIndex } from "@/lib/data/feeds";
import { loadProtectedAreaStats } from "@/lib/data/protected-area-stats";
import { atomFeed, atomResponse } from "@/lib/feeds";

export const dynamicParams = false;

/** One feed per Natura 2000 site, at /feeds/natura/{code}.xml. */
export async function generateStaticParams(): Promise<{ file: string }[]> {
  return (await loadProtectedAreaStats()).map((s) => ({ file: `${s.siteCode}.xml` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const code = file.replace(/\.xml$/, "");
  const [index, sites] = await Promise.all([loadFeedIndex(), loadProtectedAreaStats()]);
  const site = sites.find((s) => s.siteCode === code);
  if (!site) return new Response("Not found", { status: 404 });
  return atomResponse(
    atomFeed({
      path: `/feeds/natura/${code}.xml`,
      page: `/#natura`,
      title: `Impacto Acumulado · ${site.name} (${code})`,
      subtitle: `Documentos del BOE y el BOJA sobre proyectos renovables en los municipios que tocan el espacio Red Natura 2000 ${site.name}. Mide cercanía a escala municipal, no afección al espacio.`,
      generatedAt: index.generatedAt,
      entries: index.bySite.get(code) ?? [],
    }),
  );
}
