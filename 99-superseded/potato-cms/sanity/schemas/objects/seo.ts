import { defineType, defineField } from "sanity";

/**
 * Reused on every page type. Editors fill it once per page and the
 * metadata, Open Graph tags and canonical all come from here — so nobody
 * has to remember to update three separate things.
 */
export default defineType({
  name: "seo",
  title: "SEO",
  type: "object",
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({
      name: "title",
      title: "Page title",
      type: "string",
      description: "Shows in the browser tab and in search results. Aim for under 60 characters.",
      validation: (r) => r.required().max(70),
    }),
    defineField({
      name: "description",
      title: "Meta description",
      type: "text",
      rows: 2,
      description:
        "One or two sentences. This is often what someone reads before deciding to click, so write it for a person rather than for a search engine.",
      validation: (r) => r.required().min(70).max(160),
    }),
    defineField({
      name: "image",
      title: "Share image",
      type: "image",
      description: "1200 × 630. What appears when the page is shared on WhatsApp or LinkedIn.",
    }),
    defineField({
      name: "noIndex",
      title: "Hide from search engines",
      type: "boolean",
      initialValue: false,
    }),
  ],
});
