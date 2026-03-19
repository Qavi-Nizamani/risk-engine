import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Standalone mode: bundles server + traced deps into .next/standalone/
  // Required for Docker — produces a self-contained server.js with no pnpm needed.
  output: "standalone",

  // Tell Next.js to trace files from the monorepo root so workspace package
  // dependencies (e.g. @risk-engine/types) are included in the standalone output.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  reactStrictMode: true,
  transpilePackages: ["@risk-engine/types"],
};

export default nextConfig;
