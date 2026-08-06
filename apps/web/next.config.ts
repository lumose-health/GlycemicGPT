import type { NextConfig } from "next";

// Allow API origin in CSP connect-src when NEXT_PUBLIC_API_URL is set
// (local dev uses http://localhost:8000; Docker uses same-origin proxy)
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "";
const connectSrc = apiOrigin
  ? `'self' ${apiOrigin}`
  : "'self'";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const obsoleteSettingsRoutes = [
  {
    path: "profile",
    destination: "/settings/account",
  },
  {
    path: "glucose-range",
    destination: "/settings/health#glucose-ranges",
  },
  {
    path: "insulin",
    destination: "/settings/health#insulin-action",
  },
  {
    path: "safety-limits",
    destination: "/settings/health#safety-limits",
  },
  {
    path: "notifications",
    destination: "/settings/alarms-notification",
  },
  {
    path: "alerts",
    destination: "/settings/alarms-notification#alert-triggers",
  },
  {
    path: "brief-delivery",
    destination: "/settings/alarms-notification#daily-briefs",
  },
  {
    path: "communications",
    destination: "/settings/alarms-notification#delivery-channels",
  },
  {
    path: "telegram",
    destination: "/settings/alarms-notification#telegram",
  },
  {
    path: "emergency-contacts",
    destination: "/settings/care-sharing#emergency-contacts",
  },
  {
    path: "caregivers",
    destination: "/settings/care-sharing#caregiver-access",
  },
  {
    path: "caregivers/:linkId/permissions",
    destination:
      "/settings/care-sharing?caregiver=:linkId#caregiver-permissions",
  },
  {
    path: "integrations",
    destination: "/settings/connections#data-sources",
  },
  {
    path: "ai-provider",
    destination: "/settings/ai#ai-provider",
  },
  {
    path: "research-sources",
    destination: "/settings/ai#research-sources",
  },
  {
    path: "data",
    destination: "/settings/data-privacy#data-management",
  },
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Raise the rewrite-proxy timeout above Next's 30s default.
   *
   * Almost every /api/* call is sub-second, but the meal-photo upload
   * (POST /api/food-records) runs multi-sample AI vision inference that can take
   * tens of seconds. At the 30s default the proxy aborts the upstream
   * (ECONNRESET / "socket hang up") and a meal that the API actually saved
   * surfaces in the UI as a generic error. 120s comfortably covers it -- the
   * mobile client uses a 90s read timeout on the same upload for this reason.
   */
  experimental: {
    proxyTimeout: 120_000,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      ...obsoleteSettingsRoutes.flatMap(({ destination, path }) => [
        {
          source: `/settings-new/${path}`,
          destination,
          permanent: false,
        },
        {
          source: `/settings/${path}`,
          destination,
          permanent: false,
        },
      ]),
      {
        source: "/settings-new",
        destination: "/settings/account",
        permanent: false,
      },
      {
        source: "/settings-new/:path*",
        destination: "/settings/:path*",
        permanent: false,
      },
    ];
  },

  /**
   * Proxy all /api/* requests to the backend API server.
   *
   * The browser only talks to the Next.js origin (port 3000). Next.js
   * forwards API calls server-to-server, eliminating CORS and making
   * the architecture reverse-proxy-agnostic. Works identically whether
   * accessed via localhost, LAN IP, or a Cloudflare tunnel.
   *
   * Note: In standalone mode, rewrites are evaluated at build time and
   * baked into routes-manifest.json. To change the API destination,
   * rebuild the image with API_URL set. The default (http://api:8000)
   * works for Docker Compose and Kubernetes where the API service is
   * named "api".
   */
  async rewrites() {
    const apiUrl = process.env.API_URL || "http://api:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
