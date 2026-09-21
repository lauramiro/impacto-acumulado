import { Suspense } from "react";
import { preload } from "react-dom";
import { MapExplorer } from "@/components/map/map-explorer";
import { loadMapData } from "@/lib/data/map-data";

export default async function HomePage() {
  preload("/data/municipalities.geojson", { as: "fetch", crossOrigin: "anonymous" });
  preload("/data/provinces.geojson", { as: "fetch", crossOrigin: "anonymous" });
  const { municipalities, stats } = await loadMapData();
  return (
    <>
      <h1 className="visually-hidden">Mapa de capacidad renovable acumulada por municipio</h1>
      <Suspense fallback={null}>
        <MapExplorer municipalities={municipalities} stats={stats} />
      </Suspense>
    </>
  );
}
