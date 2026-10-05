import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// retired_projects.json (written by the export) maps the id of a project that was
// merged into another to the project now holding its documents.
function retiredProjects(): Record<string, number> {
  const file = path.join(process.env["IMPACTO_DATA_DIR"] ?? path.join(process.cwd(), "public", "data"), "retired_projects.json");
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Page routes only: /data/ files are public reference data that other sites read
  // from the browser, so they keep the cross-origin access the host gives static files.
  async headers() {
    return [
      {
        source: "/((?!data/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return Object.entries(retiredProjects()).map(([from, to]) => {
      if (!/^\d+$/.test(from) || !Number.isInteger(to) || to <= 0) throw new Error(`retired_projects.json: bad entry ${from} -> ${to}`);
      return { source: `/proyecto/${from}`, destination: `/proyecto/${to}`, permanent: true };
    });
  },
};

export default nextConfig;
