export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matches(name: string, query: string): boolean {
  const q = fold(query.trim());
  return q === "" || fold(name).includes(q);
}
