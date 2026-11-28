import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Resume PDFs (5 MB) and company documents (10 MB, several at once) are uploaded through server actions.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async redirects() {
    // Old (v1) URLs keep working. Everything else without a locale prefix is handled by middleware.
    return [
      { source: "/find-jobs", destination: "/en/jobs", permanent: true },
      { source: "/auth", destination: "/en/auth/login", permanent: true },
      { source: "/profile", destination: "/en/dashboard", permanent: true }
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
      ]
    }];
  }
};

export default config;
