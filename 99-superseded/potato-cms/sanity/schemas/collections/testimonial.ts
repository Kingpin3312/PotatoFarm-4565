import { defineType, defineField } from "sanity";

export default defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "quote", type: "text", rows: 3, validation: (r) => r.required().max(220) }),
    defineField({
      name: "result",
      type: "string",
      title: "The number",
      description:
        "A measurable outcome — 'viewings up 40% in eight weeks'. This is the part a brokerage owner reads. A testimonial without one is decoration.",
      validation: (r) => r.required().warning("Without a number this carries very little weight."),
    }),
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "role", type: "string", validation: (r) => r.required() }),
    defineField({ name: "company", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "photo",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", type: "string", title: "Alt text", description: "Describe the person as you would to someone on the phone." }],
    }),
    defineField({
      name: "approved",
      type: "boolean",
      title: "Approved in writing",
      description:
        "Tick only when you hold written permission to use this person's name, role and photo. Nothing publishes without it.",
      initialValue: false,
      validation: (r) => r.required(),
    }),
  ],
  preview: { select: { title: "name", subtitle: "company", media: "photo" } },
});
