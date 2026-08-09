import { defineType, defineField } from "sanity";

export default defineType({
  name: "plan",
  title: "Pricing plan",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "order", type: "number", description: "Left to right on the pricing page.", validation: (r) => r.required() }),
    defineField({ name: "summary", type: "text", rows: 2, description: "One line on who this plan is for." }),
    defineField({
      name: "price",
      type: "string",
      description:
        "The number itself, without currency or period — those are set below. Leave blank only for a 'let's talk' tier.",
    }),
    defineField({ name: "currency", type: "string", initialValue: "AED" }),
    defineField({ name: "period", type: "string", initialValue: "per user, per month" }),
    defineField({ name: "features", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "cta", type: "cta" }),
    defineField({
      name: "featured",
      type: "boolean",
      title: "Highlight this plan",
      description: "Only one. Highlighting all three highlights none.",
      initialValue: false,
    }),
  ],
  orderings: [{ title: "Display order", name: "order", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "name", subtitle: "price" } },
});
