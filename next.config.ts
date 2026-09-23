import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game is fully client-side, so it ships as plain static files (./out).
  output: "export",
  // GitHub Pages serves project sites from a sub-path (e.g. /f1-opus-5.5).
  // The deploy workflow sets it; locally the app is served from the root.
  basePath: process.env.PAGES_BASE_PATH || undefined,
};

export default nextConfig;
