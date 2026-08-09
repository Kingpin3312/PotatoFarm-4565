import { defineType, defineField } from "sanity";

/** Everything that appears on every page. Edited once, changes everywhere. */
export default defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  groups: [
    { name: "brand", title: "Brand" },
    { name: "nav", title: "Navigation" },
    { name: "contact", title: "Contact" },
  ],
  fields: [
    defineField({ name: "siteName", type: "string", group: "brand", initialValue: "Potato" }),
    defineField({ name: "logo", type: "image", group: "brand" }),
    defineField({
      name: "footerBlurb",
      type: "text",
      rows: 2,
      group: "brand",
      description: "One sentence under the logo in the footer.",
      validation: (r) => r.max(140),
    }),

    defineField({
      name: "primaryNav",
      title: "Header links",
      type: "array",
      group: "nav",
      of: [{ type: "cta" }],
      validation: (r) => r.max(6).warning("More than six links and people stop reading them."),
    }),
    defineField({
      name: "footerColumns",
      type: "array",
      group: "nav",
      of: [
        {
          type: "object",
          fields: [
            { name: "heading", type: "string" },
            { name: "links", type: "array", of: [{ type: "cta" }] },
          ],
        },
      ],
    }),

    defineField({
      name: "whatsappNumber",
      type: "string",
      group: "contact",
      description:
        "In full international format, no spaces — 971501234567. This powers every 'Message it yourself' button on the site.",
      validation: (r) => r.regex(/^\d{8,15}$/, { name: "digits only, no plus sign" }),
    }),
    defineField({ name: "salesEmail", type: "string", group: "contact" }),
    defineField({
      name: "officeAddress",
      type: "text",
      rows: 3,
      group: "contact",
      description: "Shown in the footer. A real address does more for trust than any badge.",
    }),
  ],
  preview: { prepare: () => ({ title: "Site settings" }) },
});
