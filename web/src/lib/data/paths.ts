import path from "node:path";

export function dataDir(): string {
  return process.env["IMPACTO_DATA_DIR"] ?? path.join(process.cwd(), "public", "data");
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name);
}
