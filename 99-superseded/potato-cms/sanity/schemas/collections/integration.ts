import { defineType, defineField } from "sanity";

export default defineType({
  name: "integration",
  title: "Integration",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", type: "image" }),
    defineField({ name: "description", type: "text", rows: 2, validation: (r) => r.max(120) }),
    defineField({
      name: "category",
      type: "string",
      options: { list: ["Portals", "Messaging", "Calendar", "Finance"] },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "status",
      type: "string",
      initialValue: "live",
      options: {
        list: [
          { title: "Live", value: "live" },
          { title: "In development", value: "building" },
          { title: "On request", value: "request" },
        ],
        layout: "radio",
      },
      description: "Only 'Live' means a customer can use it today. Be strict about this one.",
    }),
  ],
  preview: { select: { title: "name", subtitle: "category", media: "logo" } },
});
