import { defineType, defineField } from "sanity";

export default defineType({
  name: "post",
  title: "Blog post",
  type: "document",
  groups: [{ name: "content", title: "Content" }, { name: "seo", title: "SEO" }],
  fields: [
    defineField({ name: "title", type: "string", group: "content", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 80 },
      description: "The URL. Once a post is live, changing this breaks every link to it.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "category",
      type: "string",
      group: "content",
      options: { list: ["Market", "Guide", "Opinion"] },
      description: "Pick from the list. Inventing a new one per post turns the blog into a mess.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "excerpt", type: "text", rows: 2, group: "content", validation: (r) => r.required().max(180) }),
    defineField({ name: "coverImage", type: "image", group: "content",
      fields: [{ name: "alt", type: "string", title: "Alt text" }] }),
    defineField({ name: "author", type: "reference", to: [{ type: "person" }], group: "content" }),
    defineField({ name: "publishedAt", type: "datetime", group: "content", validation: (r) => r.required() }),
    defineField({
      name: "body",
      type: "array",
      group: "content",
      of: [
        { type: "block" },
        { type: "image", fields: [{ name: "alt", type: "string", title: "Alt text" }] },
      ],
    }),
    defineField({ name: "seo", type: "seo", group: "seo" }),
  ],
  orderings: [{ title: "Newest first", name: "newest", by: [{ field: "publishedAt", direction: "desc" }] }],
  preview: { select: { title: "title", subtitle: "category", media: "coverImage" } },
});
