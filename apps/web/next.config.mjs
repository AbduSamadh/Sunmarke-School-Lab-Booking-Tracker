import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sunmarke/rules", "@sunmarke/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // The offline demo package (apps/demo/package-site.mjs) builds a self-contained server.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone", outputFileTracingRoot: root } : {}),
};
export default nextConfig;
