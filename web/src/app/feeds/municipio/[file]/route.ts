import { loadFeedIndex } from "@/lib/data/feeds";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { atomFeed, atomResponse } from "@/lib/feeds";

export const dynamicParams = false;

/** One feed per municipality, at /feeds/municipio/{INE}.xml. */
export async function generateStaticParams(): Promise<{ file: string }[]> {
  return (await loadMunicipalities()).map((m) => ({ file: `${m.ine}.xml` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ine = file.replace(/\.xml$/, "");
  const [index, munis] = await Promise.all([loadFeedIndex(), loadMunicipalities()]);
  const muni = munis.find((m) => m.ine === ine);
  if (!muni) return new Response("Not found", { status: 404 });
  return atomResponse(
    atomFeed({
      path: `/feeds/municipio/${ine}.xml`,
      page: `/municipio/${ine}`,
      title: `Impacto Acumulado · ${muni.name}`,
      subtitle: `Documentos del BOE y el BOJA sobre proyectos renovables en ${muni.name} (${muni.province}).`,
      generatedAt: index.generatedAt,
      entries: index.byMunicipality.get(ine) ?? [],
    }),
  );
}
