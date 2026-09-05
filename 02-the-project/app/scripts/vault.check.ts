import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { seal, open, writeSecret, fetchSecret, forgetSecret, vaultReady }
  from "@/server/lib/secrets/vault";
import { readSecret } from "@/server/lib/secrets";

/**
 * The secret store, and mostly the properties that make it one.
 *
 * `readSecret` read an environment variable and threw otherwise, so
 * nothing could be connected without a redeploy. The happy path here is
 * one assertion; the rest is what separates an encrypted store from a
 * column called `token`.
 *
 *   - The plaintext must not be in the database. Asserted by reading
 *     the raw row and searching every column for it — not by trusting
 *     that `seal()` was called.
 *   - A tampered ciphertext must fail loudly. GCM's tag is the whole
 *     reason to prefer it, and a store that returned rubbish on tamper
 *     would hand that rubbish to Meta as a bearer token.
 *   - The wrong key must not decrypt.
 *   - Two writes of the same value must produce different ciphertext,
 *     or the nonce is being reused and the mode is broken.
 *   - The environment must still win, because an existing deployment
 *     already sets `SECRET_<ref>` and this change must not disconnect a
 *     channel that worked yesterday.
 *
 *     npm run check:vault
 */
let bad = 0;
const failures: string[] = [];
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) { bad++; failures.push(d ? `${l}  — ${d}` : l); }
};

/**
 * A key for this run, so the check never depends on the deployment's
 * own and never leaves a secret behind that the real key can open.
 */
const KEY = randomBytes(32).toString("base64");
process.env.SECRETS_KEY = KEY;

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation to test against"); process.exit(1); }

const REF = `check_${randomBytes(4).toString("hex")}`;
const TOKEN = `EAAG${randomBytes(24).toString("base64url")}`;
await db.secret.deleteMany({ where: { ref: { startsWith: "check_" } } });

console.log("\n=== it round-trips ===");
{
  ok("the vault reports itself ready", vaultReady());
  ok("sealed and opened is the same string", open(seal(TOKEN)) === TOKEN);
  await writeSecret({ orgId: org.id, ref: REF, value: TOKEN });
  ok("stored and fetched is the same string", (await fetchSecret(REF)) === TOKEN);
}

console.log("\n=== and the plaintext is not in the database ===");
{
  // Read the row and search every column. Asserting that `seal` was
  // called would prove the code path, not the property.
  const row = await db.secret.findUnique({ where: { ref: REF } });
  const all = JSON.stringify(row);
  ok("no column contains the token", !all.includes(TOKEN),
     "searched the whole row, not just the ciphertext column");
  ok("the ciphertext is not the token in base64",
     row?.ciphertext !== Buffer.from(TOKEN).toString("base64"),
     "which is what an 'encryption' that only encodes would produce");
  ok("a nonce and a tag are stored beside it",
     Boolean(row?.iv) && Boolean(row?.tag));
  ok("and the key version, so a rotation has something to rotate from",
     row?.keyVersion === 1);
}

console.log("\n=== tampering fails loudly ===");
{
  const row = await db.secret.findUniqueOrThrow({ where: { ref: REF } });
  // Flip one byte of the ciphertext. GCM must refuse it rather than
  // return plausible rubbish that then gets sent as a bearer token.
  const raw = Buffer.from(row.ciphertext, "base64");
  raw[0] = raw[0]! ^ 0x01;
  await db.secret.update({
    where: { ref: REF }, data: { ciphertext: raw.toString("base64") },
  });

  let threw = false;
  try { await fetchSecret(REF); } catch { threw = true; }
  ok("one flipped byte is refused, not decoded", threw,
     "an unauthenticated mode would have returned rubbish");

  // Put it back.
  await writeSecret({ orgId: org.id, ref: REF, value: TOKEN });
  ok("and it still opens once restored", (await fetchSecret(REF)) === TOKEN);
}

console.log("\n=== the wrong key does not open it ===");
{
  process.env.SECRETS_KEY = randomBytes(32).toString("base64");
  let threw = false;
  try { await fetchSecret(REF); } catch { threw = true; }
  ok("a different key cannot read it", threw,
     "which is what makes a database dump worthless on its own");
  process.env.SECRETS_KEY = KEY;
}

console.log("\n=== the nonce is not reused ===");
{
  const a = seal(TOKEN);
  const b = seal(TOKEN);
  ok("the same value seals to different ciphertext", a.ciphertext !== b.ciphertext);
  // The real property. Reusing a nonce under one key is the single way
  // to break GCM badly, so this is the assertion that matters.
  ok("because the nonce differs", a.iv !== b.iv);
}

console.log("\n=== an unconfigured vault refuses rather than storing plaintext ===");
{
  delete process.env.SECRETS_KEY;
  ok("it reports itself not ready", !vaultReady());
  let threw = false;
  try { seal("anything"); } catch { threw = true; }
  ok("and sealing throws", threw, "never a fallback that writes it in the clear");
  process.env.SECRETS_KEY = KEY;
}

console.log("\n=== the environment still wins ===");
{
  // An existing deployment already sets SECRET_<ref>. This change must
  // not disconnect a channel that was working yesterday.
  process.env[`SECRET_${REF}`] = "from-the-environment";
  ok("readSecret prefers the environment variable",
     (await readSecret(REF)) === "from-the-environment");
  delete process.env[`SECRET_${REF}`];
  ok("and falls through to the store when it is absent",
     (await readSecret(REF)) === TOKEN);
}

console.log("\n=== forgetting is forgetting ===");
{
  await forgetSecret(REF);
  ok("the row is gone", (await db.secret.findUnique({ where: { ref: REF } })) === null);
  let threw = false;
  try { await readSecret(REF); } catch { threw = true; }
  ok("and readSecret says so rather than returning empty", threw);
}

await db.secret.deleteMany({ where: { ref: { startsWith: "check_" } } });
await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\na token can be stored, and the database alone cannot read it.\n");
process.exit(bad ? 1 : 0);
