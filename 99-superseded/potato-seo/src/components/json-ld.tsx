/**
 * Renders JSON-LD server-side. Two details that matter:
 *
 * 1. It has to be in the HTML at first response. Injecting structured data
 *    with client JavaScript means crawlers that don't execute scripts —
 *    which includes several of the AI ones — never see it.
 * 2. The `<` escape prevents a stray character in CMS content from closing
 *    the script tag early. That's an XSS hole, and it's an easy one to
 *    leave open when the data comes from an editor.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(d).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
