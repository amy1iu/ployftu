import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge from covering the sidebar's user avatar.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
