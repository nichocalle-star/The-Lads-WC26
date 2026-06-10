import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" }, // Google profile photos
      { hostname: "api.sofascore.app" },           // Team logos
    ],
  },
};

export default nextConfig;
