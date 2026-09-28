import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Verification builds can use a separate directory while the local app stays open.
  distDir: process.env.ALMAWORKS_BUILD_DIR ?? ".next",
  turbopack: {
    root: projectRoot,
  },
  webpack: (config) => {
    const existingIgnored = config.watchOptions?.ignored;
    const ignored = existingIgnored instanceof RegExp
      ? new RegExp(`(?:${existingIgnored.source})|(?:[\\\\/]work[\\\\/])`, existingIgnored.flags)
      : [
          ...(Array.isArray(existingIgnored)
            ? existingIgnored.filter((pattern): pattern is string => typeof pattern === "string")
            : typeof existingIgnored === "string"
              ? [existingIgnored]
              : []),
          "**/work/**",
        ];

    // The local dev launcher writes its logs under work/, which must not invalidate HMR.
    config.watchOptions = {
      ...config.watchOptions,
      ignored,
    };

    return config;
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.squarespace-cdn.com",
      },
    ],
  },
};

export default nextConfig;
