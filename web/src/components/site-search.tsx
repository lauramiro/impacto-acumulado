"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { KIND_LABELS, searchSite, type SearchEntry } from "@/lib/site-search";
import styles from "./site-search.module.css";

/** Fetched once per visit, the first time someone uses the box: the pages do not carry it. */
let index: Promise<SearchEntry[]> | null = null;
function loadIndex(): Promise<SearchEntry[]> {
  index ??= fetch("/indice-busqueda.json").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<SearchEntry[]>;
  });
  index.catch(() => {
    index = null;
  });
  return index;
}

/** One box for every page: a municipality, a protected site, a developer, a project or an expediente number. */
export function SiteSearch() {
  const router = useRouter();
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();

  const typed = query.trim() !== "";
  const results = entries && typed ? searchSite(entries, query) : [];
  const open = focused && results.length > 0;
  const current = Math.min(active, results.length - 1);

  function load() {
    if (entries) return;
    loadIndex().then(
      (e) => {
        setEntries(e);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }

  // "/" anywhere outside a field jumps to the search, as on most sites with one box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(e: SearchEntry) {
    setQuery("");
    setActive(0);
    input.current?.blur();
    router.push(e.href);
  }

  const status = !typed
    ? ""
    : failed
      ? "No se ha podido cargar el índice de búsqueda."
      : !entries
        ? "Cargando…"
        : results.length > 0
          ? `${results.length} resultados`
          : "Nada coincide con la búsqueda.";

  return (
    <div className={styles.buscador} role="search">
      <label htmlFor={inputId} className="visually-hidden">
        Buscar municipio, espacio protegido, promotor, proyecto o expediente
      </label>
      <input
        ref={input}
        id={inputId}
        type="search"
        className={styles.campo}
        value={query}
        placeholder="Buscar municipio, promotor, proyecto…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        onFocus={() => {
          setFocused(true);
          load();
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          load();
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
            go(results[current]!);
          } else if (e.key === "Escape") {
            setQuery("");
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda" className={styles.lista} hidden={!open}>
        {results.map((r, i) => (
          <li key={r.href} id={`${listId}-${i}`} role="option" aria-selected={i === current} className={i === current ? styles.activa : undefined}>
            {/* A real link: it opens in a new tab like any other, and the mouse never steals focus from the field. */}
            <a href={r.href} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              go(r);
            }}>
              <span className={styles.nombre}>{r.name}</span>
              <span className={styles.tipo}>
                {KIND_LABELS[r.kind]}
                {r.detail ? ` · ${r.detail}` : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p role="status" className="visually-hidden">
        {status}
      </p>
      {focused && typed && !open ? <p className={styles.vacio}>{status}</p> : null}
    </div>
  );
}
