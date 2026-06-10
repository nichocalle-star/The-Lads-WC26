import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" }, // Google profile photos
      { hostname: "a.espncdn.com" },                 // ESPN team logos
    ],
  },
};

export default nextConfig;
