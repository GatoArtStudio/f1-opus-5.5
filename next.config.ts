import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game is fully client-side, so it ships as plain static files (./out).
  output: "export",
};

export default nextConfig;
