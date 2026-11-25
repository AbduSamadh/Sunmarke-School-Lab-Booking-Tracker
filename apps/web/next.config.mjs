/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sunmarke/rules", "@sunmarke/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
};
export default nextConfig;
