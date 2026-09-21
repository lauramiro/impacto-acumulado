import type { ProtectedAreaRef } from "@/lib/types";

export function ProtectedAreas({ areas }: { areas: ProtectedAreaRef[] }) {
  return (
    <section aria-labelledby="natura">
      <h2 id="natura">Red Natura 2000</h2>
      {areas.length === 0 ? (
        <p>Ningún espacio de la Red Natura 2000 intersecta el término.</p>
      ) : (
        <ul>
          {areas.map((a) => (
            <li key={a.siteCode}>
              <span className="dato">{a.siteCode}</span> · {a.name} · <span className="dato">{a.type}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="pie">Espacios cuya geometría intersecta el término municipal completo.</p>
    </section>
  );
}
