import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // transformers.js / onnxruntime — client-only WASM STT (free continuous mic)
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // Web Worker (whisper.worker.ts) needs a browser globalObject for webpack
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output = config.output || {};
      config.output.globalObject = "self";
    }
    return config;
  },
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
