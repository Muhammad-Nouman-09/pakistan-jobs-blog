import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/env";

/** Private areas (dashboards, auth, invitations, APIs) are blocked from crawling; they also send noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/*/admin", "/*/employer", "/*/candidate", "/*/auth/", "/*/invitations", "/*/dashboard", "/*/jobs/*/apply"]
    }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl()
  };
}
