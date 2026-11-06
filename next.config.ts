import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp", "archiver"],
  experimental: { serverActions: { bodySizeLimit: "4gb" } },
};

export default nextConfig;
