/** @type {import('next').NextConfig} */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load monorepo-root `.env` into process.env BEFORE Next.js reads it.
// Next normally only sees `apps/web/.env`; we keep a single root .env so the
// worker (which uses Node `--env-file`) and the web app share secrets.
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue; // don't override real env
    // Strip surrounding quotes if present
    process.env[key] = rawVal.replace(/^["'](.*)["']$/, "$1");
  }
}

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    "@coaching/ai",
    "@coaching/db",
    "@coaching/strava",
    "@coaching/training",
  ],
  webpack: (config) => {
    // Workspace packages re-export with explicit `.js` extensions for
    // Node-ESM compatibility. Webpack must be told to also resolve those
    // to `.ts` source when consumed via `transpilePackages`.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
