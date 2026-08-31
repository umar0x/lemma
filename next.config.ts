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

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  devIndicators: false,
  ...devOnlyHeaders,
};

export default nextConfig;
