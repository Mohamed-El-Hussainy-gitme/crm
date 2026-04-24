import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typedRoutes: true,
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
