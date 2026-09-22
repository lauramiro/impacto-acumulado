const LOCALE = "es-ES";

// es-ES CLDR data sets minimumGroupingDigits to 2, so the default "auto" grouping
// strategy omits the thousands separator on four-digit numbers (e.g. 1234 -> "1234").
// useGrouping: true forces the separator at every group, matching Spanish convention
// for figures in this context (MW, ha, counts).
const oneDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: true,
});
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, useGrouping: true });
const longDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: "long", timeZone: "UTC" });

export function formatNumber(n: number, decimals: 0 | 1): string {
  return decimals === 0 ? integer.format(n) : oneDecimal.format(n);
}

export function formatMw(n: number): string {
  return `${oneDecimal.format(n)} MW`;
}

export function formatHa(n: number): string {
  return `${oneDecimal.format(n)} ha`;
}

export function formatInt(n: number): string {
  return integer.format(n);
}

export function formatPercent(share: number): string {
  return `${integer.format(Math.round(share * 100))} %`;
}

/** ISO date `YYYY-MM-DD` to "8 de agosto de 2019". */
export function formatDate(iso: string): string {
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}

export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

const twoDecimals = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A 0 to 1 score such as a match or confidence value: "0,82". */
export function formatScore(n: number): string {
  return twoDecimals.format(n);
}

/**
 * A file size in bytes as "330 B", "8,8 KB" or "2,0 MB". Below 1 000 bytes it
 * shows the exact byte count rather than rounding a small file down to "0 KB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${integer.format(bytes)} B`;
  if (bytes < 1_000_000) return `${oneDecimal.format(bytes / 1000)} KB`;
  return `${oneDecimal.format(bytes / 1_000_000)} MB`;
}
