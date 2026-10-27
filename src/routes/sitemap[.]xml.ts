import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n  <url><loc>${BASE_URL}/sistema</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n</urlset>`,
          {
            headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
          },
        ),
    },
  },
});
