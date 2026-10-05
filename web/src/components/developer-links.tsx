import { Fragment } from "react";
import Link from "next/link";
import { developerParts } from "@/lib/developers";

/** A project's developer as printed, each company linked to its page; "Promotor no identificado" when there is none. */
export function DeveloperLinks({ developer, keys }: { developer: string | null; keys: ReadonlyMap<string, string> }) {
  const parts = developerParts(developer, keys);
  if (parts.length === 0) return <>Promotor no identificado</>;
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={p.name}>
          {i > 0 ? "; " : null}
          {p.key ? <Link href={`/promotor/${p.key}`}>{p.name}</Link> : p.name}
        </Fragment>
      ))}
    </>
  );
}
