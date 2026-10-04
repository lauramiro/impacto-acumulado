import { loadFeedIndex } from "@/lib/data/feeds";
import { atomFeed, atomResponse } from "@/lib/feeds";

export const dynamic = "force-static";

export async function GET() {
  const index = await loadFeedIndex();
  return atomResponse(
    atomFeed({
      path: "/feeds/andalucia.xml",
      page: "/",
      title: "Impacto Acumulado · Andalucía",
      subtitle: "Documentos del BOE y el BOJA sobre proyectos renovables en Andalucía: información pública, autorizaciones y declaraciones.",
      generatedAt: index.generatedAt,
      entries: index.all,
    }),
  );
}
