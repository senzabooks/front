import sanity from "@sanity/astro";
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  adapter: netlify(),
  site: "https://dzastins.com",
  transitions: { enabled: true },

  integrations: [
    sanity({
      projectId: "88b6ol4q",
      dataset: "production",
      useCdn: false,
    }),
    react(),
    sitemap(),
  ],
});
