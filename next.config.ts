import type { NextConfig } from "next";

// Static export cannot emit headers, so production relies on vercel.json /
// netlify.toml / public/_headers. Local `next dev` gets them here instead.
// WebMCP registerTool() requires an origin-keyed agent cluster
// (Origin-Agent-Cluster: ?1) per the spec, so dev must serve it too.
const devOnlyHeaders: Pick<NextConfig, "headers"> =
  process.env.NODE_ENV === "development"
    ? {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "Origin-Agent-Cluster", value: "?1" },
                {
                  key: "Content-Security-Policy",
                  value:
                    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
                },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), tools=(self)" },
                { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              ],
            },
          ];
        },
      }
    : {};

// PostHog reverse proxy rewrites — active only during `next dev` (static export
// does not emit rewrites; production proxy is handled by vercel.json / netlify.toml).
const devOnlyRewrites: Pick<NextConfig, "rewrites"> =
  process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [
            {
              source: "/ingest/static/:path*",
              destination: "https://us-assets.i.posthog.com/static/:path*",
            },
            {
              source: "/ingest/array/:path*",
              destination: "https://us-assets.i.posthog.com/array/:path*",
            },
            {
              source: "/ingest/:path*",
              destination: "https://us.i.posthog.com/:path*",
            },
          ];
        },
      }
    : {};

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  ...devOnlyHeaders,
  ...devOnlyRewrites,
};

export default nextConfig;
