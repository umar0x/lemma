import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (process.env.NODE_ENV !== "production" && (!token || !host)) {
  throw new Error(
    `${!token ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST"} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once the variable is configured.`,
  );
}

if (token && host) {
  // Derive the PostHog app UI host from the ingestion host
  // e.g. https://us.i.posthog.com → https://us.posthog.com
  const uiHost = host.replace(/\.i\.posthog\.com$/, ".posthog.com");

  posthog.init(token, {
    // Route through the same-origin reverse proxy so ad blockers don't suppress events.
    // The proxy is configured in next.config.ts (dev) and vercel.json / netlify.toml (prod).
    api_host: "/ingest",
    ui_host: uiHost,
    defaults: "2026-01-30",
    // Enable automatic exception capture via PostHog Error Tracking
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
