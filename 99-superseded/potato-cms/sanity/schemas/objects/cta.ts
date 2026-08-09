import { defineType, defineField } from "sanity";

export default defineType({
  name: "cta",
  title: "Button",
  type: "object",
  fields: [
    defineField({
      name: "label",
      type: "string",
      description: "Say what happens when it's pressed. 'Book a call', not 'Submit'.",
      validation: (r) => r.required().max(30),
    }),
    defineField({ name: "href", title: "Link", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "variant",
      type: "string",
      initialValue: "primary",
      options: {
        list: [
          { title: "Primary (brass)", value: "primary" },
          { title: "Secondary (teal outline)", value: "signal" },
          { title: "Quiet", value: "ghost" },
        ],
        layout: "radio",
      },
    }),
  ],
});
