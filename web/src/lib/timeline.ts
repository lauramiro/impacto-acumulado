import { EVENTS, type EventKind, type MonthlyEvent, type Scope, type Technology } from "./types";

/** The series starts here; documents published before it are counted by `documentsBefore`. */
export const TIMELINE_START = "2022-01";

/** How many documents precede the series, and the first year any was published (null when none). */
export function documentsBefore(publishedAt: readonly string[], start: string = TIMELINE_START): { count: number; firstYear: string | null } {
  const before = publishedAt.filter((d) => d < start).sort();
  return { count: before.length, firstYear: before.length > 0 ? before[0].slice(0, 4) : null };
}

/** The note under the timeline about the years the series leaves out, or null when there are none. */
export function earlyNote(early: { count: number; firstYear: string | null }, start: string = TIMELINE_START): string | null {
  if (early.count === 0 || early.firstYear === null) return null;
  const lastYear = String(Number(start.slice(0, 4)) - 1);
  const span = early.firstYear === lastYear ? `En ${lastYear}` : `Entre ${early.firstYear} y ${lastYear}`;
  const docs = early.count === 1 ? "solo contiene 1 documento" : `solo contiene ${early.count.toLocaleString("es-ES")} documentos`;
  return `${span} la colección ${docs}; la serie empieza en ${start.slice(0, 4)}.`;
}

export type Series = Record<EventKind, number[]>;

/** Inclusive list of "YYYY-MM" months from start to end. */
export function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function buildSeries(
  events: readonly MonthlyEvent[],
  scope: Scope,
  technologies: ReadonlySet<Technology>,
  months: readonly string[],
): Series {
  const index = new Map(months.map((m, i) => [m, i]));
  const series = Object.fromEntries(EVENTS.map((e) => [e, months.map(() => 0)])) as Series;
  for (const ev of events) {
    if (ev.scope !== scope || !technologies.has(ev.technology)) continue;
    const i = index.get(ev.month);
    if (i === undefined) continue;
    series[ev.event][i] += ev.count;
  }
  return series;
}

export type Peak = { value: number; index: number };

/**
 * Each row's highest month, for rows drawn on their own scale. A tie goes to
 * the earliest month; an all-zero row gives value 0 at index 0.
 */
export function rowPeaks(series: Series): Record<EventKind, Peak> {
  return Object.fromEntries(
    EVENTS.map((e) => [e, series[e].reduce<Peak>((best, n, i) => (n > best.value ? { value: n, index: i } : best), { value: 0, index: 0 })]),
  ) as Record<EventKind, Peak>;
}

const SHORT_MONTHS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];

/** "2023-03" -> "mar. 2023", short enough for a row label on a phone. */
export function shortMonth(month: string): string {
  return `${SHORT_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function yearTotals(series: Series, months: readonly string[]): { year: string; counts: Record<EventKind, number> }[] {
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  return years.map((year) => {
    const counts = Object.fromEntries(
      EVENTS.map((e) => [e, months.reduce((sum, m, i) => (m.startsWith(year) ? sum + series[e][i] : sum), 0)]),
    ) as Record<EventKind, number>;
    return { year, counts };
  });
}

const shortMonthYear = new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2023-03" as "mar 2023", for the narrow month column of the data table. */
export function formatShortMonth(month: string): string {
  return shortMonthYear.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
}
