import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    webpackBuildWorker: false,
  },
};

export default nextConfig;
