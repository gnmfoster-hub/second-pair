import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: there is a stray package-lock.json further up the
  // filesystem that Turbopack otherwise tries to adopt.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
