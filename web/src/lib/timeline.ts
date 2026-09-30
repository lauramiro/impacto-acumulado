import { EVENTS, type EventKind, type MonthlyEvent, type Scope, type Technology } from "./types";

/** 2019 to 2021 hold 5 documents in the collection; the series starts here. */
export const TIMELINE_START = "2022-01";

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

export function seriesMax(series: Series): number {
  return Math.max(0, ...EVENTS.flatMap((e) => series[e]));
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
