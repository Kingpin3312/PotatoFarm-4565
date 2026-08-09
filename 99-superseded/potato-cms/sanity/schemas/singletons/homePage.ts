import { defineType, defineField } from "sanity";

/**
 * The homepage, section by section, in the order they appear. Nothing on
 * the page is hardcoded — including the hero conversation, which needs to
 * change whenever the qualifying script does.
 */
export default defineType({
  name: "homePage",
  title: "Homepage",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "body", title: "Sections" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({ name: "eyebrow", type: "string", group: "hero", initialValue: "WhatsApp CRM for brokerages" }),
    defineField({
      name: "heading",
      type: "text",
      rows: 2,
      group: "hero",
      description: "Sentence case, and end it with a full stop. It makes a claim sound like a fact.",
      validation: (r) => r.required().max(90),
    }),
    defineField({ name: "subheading", type: "text", rows: 3, group: "hero", validation: (r) => r.required().max(260) }),
    defineField({ name: "heroButtons", type: "array", group: "hero", of: [{ type: "cta" }], validation: (r) => r.max(2) }),
    defineField({ name: "heroFinePrint", type: "string", group: "hero" }),

    defineField({
      name: "heroThread",
      title: "Hero conversation",
      type: "array",
      group: "hero",
      description:
        "The exchange that types out in the hero. Keep it honest — it should look like a real enquiry your assistant would actually handle.",
      of: [
        {
          type: "object",
          fields: [
            {
              name: "from",
              type: "string",
              options: { list: [{ title: "Lead", value: "lead" }, { title: "Potato", value: "bot" }], layout: "radio" },
              initialValue: "lead",
            },
            { name: "text", type: "text", rows: 2, validation: (r: any) => r.required().max(180) },
            { name: "time", type: "string", description: "e.g. 23:14" },
          ],
          preview: {
            select: { from: "from", text: "text" },
            prepare: ({ from, text }: any) => ({ title: text, subtitle: from === "bot" ? "Potato" : "Lead" }),
          },
        },
      ],
    }),
    defineField({ name: "heroThreadOutcome", type: "string", group: "hero",
      description: "The summary line under the conversation." }),

    defineField({ name: "problemHeading", type: "text", rows: 2, group: "body" }),
    defineField({ name: "problemBody", type: "text", rows: 4, group: "body" }),
    defineField({
      name: "problemStats",
      type: "array",
      group: "body",
      description:
        "Three figures. Use your own data, and if you can't evidence one, leave it out rather than estimating — brokers check.",
      of: [{ type: "object", fields: [
        { name: "value", type: "string" },
        { name: "label", type: "string" },
        { name: "source", type: "string", title: "Where this figure comes from" },
      ]}],
      validation: (r) => r.max(3),
    }),

    defineField({ name: "steps", type: "array", group: "body",
      of: [{ type: "object", fields: [
        { name: "title", type: "string" }, { name: "body", type: "text", rows: 3 },
      ]}], validation: (r) => r.length(3) }),

    defineField({ name: "features", type: "array", group: "body",
      of: [{ type: "object", fields: [
        { name: "title", type: "string" }, { name: "body", type: "text", rows: 3 },
      ]}] }),

    defineField({ name: "featuredTestimonials", type: "array", group: "body",
      of: [{ type: "reference", to: [{ type: "testimonial" }] }], validation: (r) => r.max(3) }),
    defineField({ name: "featuredFaqs", type: "array", group: "body",
      of: [{ type: "reference", to: [{ type: "faq" }] }] }),

    defineField({ name: "closingHeading", type: "string", group: "body" }),
    defineField({ name: "closingBody", type: "text", rows: 3, group: "body" }),

    defineField({ name: "seo", type: "seo", group: "seo", validation: (r) => r.required() }),
  ],
  preview: { prepare: () => ({ title: "Homepage" }) },
});
