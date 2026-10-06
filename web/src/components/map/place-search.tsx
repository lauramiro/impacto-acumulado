"use client";

import { useId, useState } from "react";
import { fold, matches } from "@/lib/search";
import type { MapMunicipality } from "@/lib/types";
import styles from "./place-search.module.css";

const MAX_RESULTS = 8;

/** Municipalities whose name matches, those that start with the query first, then alphabetically. */
export function findPlaces<T extends { name: string }>(places: readonly T[], query: string, limit = MAX_RESULTS): T[] {
  const q = fold(query.trim());
  if (q === "") return [];
  return places
    .filter((p) => matches(p.name, query))
    .sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)) || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

type Props = {
  places: readonly MapMunicipality[];
  /** Picks a municipality: the map selects it and the URL takes ?m=. */
  onPick: (ine: string) => void;
};

/** The first thing on the page after the headline: most visitors come for one place. */
export function PlaceSearch({ places, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = useId();
  const results = findPlaces(places, query);
  const open = results.length > 0;
  const current = Math.min(active, results.length - 1);

  function pick(p: MapMunicipality) {
    onPick(p.ine);
    setQuery("");
    setActive(0);
  }

  return (
    <div className={styles.buscador} role="search">
      <label htmlFor={inputId} className={styles.etiqueta}>
        Buscar un municipio en el mapa
      </label>
      <input
        id={inputId}
        type="search"
        className={styles.campo}
        value={query}
        placeholder="Por ejemplo, Ronda"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && open) {
            e.preventDefault();
            setActive((current + 1) % results.length);
          } else if (e.key === "ArrowUp" && open) {
            e.preventDefault();
            setActive((current - 1 + results.length) % results.length);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            pick(results[current]);
          } else if (e.key === "Escape") {
            setQuery("");
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label="Municipios encontrados" className={styles.lista} hidden={!open}>
        {results.map((p, i) => (
          <li key={p.ine} id={`${listId}-${i}`} role="option" aria-selected={i === current} className={i === current ? styles.activa : undefined}>
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              {p.name} <span className={styles.provincia}>{p.province}</span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="visually-hidden">
        {query.trim() === "" ? "" : open ? `${results.length} municipios encontrados` : "Ningún municipio coincide con la búsqueda."}
      </p>
      {query.trim() !== "" && !open ? <p className={styles.vacio}>Ningún municipio coincide con la búsqueda.</p> : null}
    </div>
  );
}
