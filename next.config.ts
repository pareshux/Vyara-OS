import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    nodeMiddleware: true,
  },
};

export default nextConfig;
