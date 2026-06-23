import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load firebase-admin from node_modules at runtime instead of bundling it.
  // Bundling breaks firebase-admin/auth (its dynamic crypto/JWT requires don't
  // survive the bundler), which made every route verifying a user ID token
  // (e.g. /api/refresh, /api/submit-prediction) crash on load with a 500.
  serverExternalPackages: ["firebase-admin"],
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" }, // Google profile photos
      { hostname: "a.espncdn.com" },                 // ESPN team logos
    ],
  },
};

export default nextConfig;
