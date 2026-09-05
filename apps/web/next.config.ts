import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  outputFileTracingIncludes: {
    "/**/*": ["../../node_modules/@prisma/client/runtime/query_compiler_bg.postgresql.wasm"],
  },
  turbopack: {
    root: monorepoRoot,
  },
  reactStrictMode: true,
  transpilePackages: ["@orbit/db"],
};

export default nextConfig;
