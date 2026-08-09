import { defineType, defineField } from "sanity";

export default defineType({
  name: "person",
  title: "Person",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "role", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "photo",
      type: "image",
      options: { hotspot: true },
      fields: [{
        name: "alt",
        type: "string",
        title: "Alt text",
        description:
          "Describe this specific person accurately. Generic alt text on a team page reads as carelessness, and people notice when it's wrong about them.",
      }],
    }),
    defineField({ name: "linkedin", type: "url" }),
    defineField({ name: "order", type: "number" }),
  ],
  preview: { select: { title: "name", subtitle: "role", media: "photo" } },
});
