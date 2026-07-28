import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PWA: headers help installability / offline shell
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/memorize", destination: "/plans/new", permanent: false },
      { source: "/map", destination: "/plans/journey", permanent: false },
      { source: "/focus", destination: "/plans/journey", permanent: false },
      { source: "/voice", destination: "/plans/journey", permanent: false },
      { source: "/revision", destination: "/plans/journey", permanent: false },
      { source: "/notifications", destination: "/settings", permanent: false },
    ];
  },
};

export default nextConfig;
