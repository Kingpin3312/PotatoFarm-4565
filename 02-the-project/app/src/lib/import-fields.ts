/**
 * The fields a spreadsheet row can fill, and the guess at which column is
 * which. Shared by the import screen, which shows the guesses, and the
 * server's planner (`server/lib/import/plan.ts`), which reads the rows.
 */

export const FIELDS = [
  "name", "firstName", "lastName", "phone", "email", "source", "notes",
  "agent", "budget", "areas", "bedrooms", "tags",
] as const;
export type Field = (typeof FIELDS)[number];
export type Mapping = Partial<Record<Field, string>>;

export const FIELD_LABEL: Record<Field, string> = {
  name: "Full name", firstName: "First name", lastName: "Last name", phone: "Phone",
  email: "Email", source: "Where they came from", notes: "Notes", agent: "Agent (email or name)",
  budget: "Budget (AED)", areas: "Areas", bedrooms: "Bedrooms", tags: "Tags",
};

/** Header words other systems use, most specific first. */
const GUESS: [Field, RegExp][] = [
  ["firstName", /^(first|given)[ _-]?name$/],
  ["lastName", /^(last|family|sur)[ _-]?name$|^surname$/],
  ["phone", /phone|mobile|whats ?app|contact[ _-]?(no|number)|^tel/],
  ["email", /e-?mail/],
  ["agent", /agent|owner|assigned|consultant|broker/],
  ["source", /source|channel|origin|portal/],
  ["budget", /budget|price|max/],
  ["bedrooms", /bed|br$|rooms/],
  ["areas", /area|communit|location|district|preferred/],
  ["tags", /tag|label|group/],
  ["notes", /note|comment|remark|description|requirement/],
  ["name", /name|client|contact|lead/],
];

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const taken = new Set<string>();
  for (const [field, re] of GUESS) {
    const h = headers.find((x) => !taken.has(x) && re.test(x.toLowerCase().trim()));
    if (h && !m[field]) { m[field] = h; taken.add(h); }
  }
  // A full name and a first/last pair are alternatives; prefer the pair
  // only when there is no full name.
  if (m.name && (m.firstName || m.lastName)) { delete m.firstName; delete m.lastName; }
  return m;
}

