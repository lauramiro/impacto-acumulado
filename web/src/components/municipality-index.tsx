"use client";

import type { Metric, Municipality } from "@/lib/types";

export type IndexRow = Municipality & { value: number };

export type MunicipalityIndexProps = {
  rows: IndexRow[];
  metric: Metric;
  selected: string | null;
  onSelect: (ine: string | null) => void;
};

export function MunicipalityIndex(_props: MunicipalityIndexProps) {
  return null;
}
