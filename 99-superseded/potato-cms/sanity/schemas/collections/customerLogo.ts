import { defineType, defineField } from "sanity";

export default defineType({
  name: "customerLogo",
  title: "Customer logo",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", type: "image", validation: (r) => r.required() }),
    defineField({ name: "order", type: "number" }),
    defineField({
      name: "approved",
      type: "boolean",
      title: "Permission on file",
      description: "Written permission to display this brand. Untick and it disappears from the site.",
      initialValue: false,
      validation: (r) => r.required(),
    }),
  ],
  preview: { select: { title: "name", media: "logo" } },
});
