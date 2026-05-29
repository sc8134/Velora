import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint during production build (lint locally instead)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow images from Google favicon service and thumbnails
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "**.ggpht.com" },
      { protocol: "https", hostname: "i.scdn.co" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
};

export default nextConfig;
