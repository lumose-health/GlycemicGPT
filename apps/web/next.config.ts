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

const nextConfig: NextConfig = {
  output: undefined,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
      {
        source: "/settings-new/profile",
        destination: "/settings-new/account",
        permanent: false,
      },
      {
        source: "/settings-new/glucose-range",
        destination: "/settings-new/health#glucose-ranges",
        permanent: false,
      },
      {
        source: "/settings-new/insulin",
        destination: "/settings-new/health#insulin-action",
        permanent: false,
      },
      {
        source: "/settings-new/safety-limits",
        destination: "/settings-new/health#safety-limits",
        permanent: false,
      },
      {
        source: "/settings-new/notifications",
        destination: "/settings-new/alarms-notification",
        permanent: false,
      },
      {
        source: "/settings-new/alerts",
        destination: "/settings-new/alarms-notification#alert-triggers",
        permanent: false,
      },
      {
        source: "/settings-new/brief-delivery",
        destination: "/settings-new/alarms-notification#daily-briefs",
        permanent: false,
      },
      {
        source: "/settings-new/communications",
        destination: "/settings-new/alarms-notification#delivery-channels",
        permanent: false,
      },
      {
        source: "/settings-new/telegram",
        destination: "/settings-new/alarms-notification#telegram",
        permanent: false,
      },
      {
        source: "/settings-new/emergency-contacts",
        destination: "/settings-new/care-sharing#emergency-contacts",
        permanent: false,
      },
      {
        source: "/settings-new/caregivers",
        destination: "/settings-new/care-sharing#caregiver-access",
        permanent: false,
      },
      {
        source: "/settings-new/caregivers/:linkId/permissions",
        destination:
          "/settings-new/care-sharing?caregiver=:linkId#caregiver-permissions",
        permanent: false,
      },
      {
        source: "/settings-new/integrations",
        destination: "/settings-new/connections#data-sources",
        permanent: false,
      },
      {
        source: "/settings-new/ai-provider",
        destination: "/settings-new/ai#ai-provider",
        permanent: false,
      },
      {
        source: "/settings-new/research-sources",
        destination: "/settings-new/ai#research-sources",
        permanent: false,
      },
      {
        source: "/settings-new/data",
        destination: "/settings-new/data-privacy#data-management",
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
