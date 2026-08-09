import { defineType, defineField } from "sanity";

/**
 * Kept as its own document with its own warnings, because this is the one
 * page where an overstated claim costs a deal in a due diligence meeting.
 */
export default defineType({
  name: "securityPage",
  title: "Security page",
  type: "document",
  fields: [
    defineField({ name: "heading", type: "text", rows: 2, validation: (r) => r.required() }),
    defineField({ name: "intro", type: "text", rows: 3 }),
    defineField({
      name: "assurances",
      type: "array",
      description:
        "Only what is true and can be evidenced today. Never a certification you are working towards — if you aren't certified, describe what you actually do instead. Honest reads better than a badge nobody checks.",
      of: [{ type: "object", fields: [
        { name: "title", type: "string" },
        { name: "body", type: "text", rows: 3 },
        { name: "evidenceUrl", type: "url", title: "Link to the evidence (optional but strongly encouraged)" },
      ]}],
    }),
    defineField({
      name: "subProcessors",
      title: "Sub-processors",
      type: "array",
      description:
        "Every third party that touches customer data. Keep this current — an out-of-date list is worse than none, because it looks like a document nobody owns.",
      of: [{ type: "object", fields: [
        { name: "provider", type: "string" },
        { name: "purpose", type: "string" },
        { name: "region", type: "string" },
      ]}],
    }),
    defineField({ name: "lastReviewed", type: "date", title: "Last reviewed",
      description: "Shown on the page. A visible review date is itself a trust signal." }),
    defineField({ name: "seo", type: "seo", validation: (r) => r.required() }),
  ],
  preview: { prepare: () => ({ title: "Security page" }) },
});
