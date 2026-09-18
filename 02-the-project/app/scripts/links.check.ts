/**
 * The three things an agent taps on a viewing, and whether they work.
 *
 * ## Why this check exists
 *
 * All three were wrong at once, in three different ways, and none of
 * them could be seen from a screenshot:
 *
 * - **WhatsApp was absent.** In a WhatsApp-first CRM. `whatsapp()` had
 *   been written from the start and its only caller was
 *   `contact-row.tsx`, which nothing imports — so the product shipped
 *   with no WhatsApp link on any screen.
 * - **Directions dropped a pin.** `maps.google.com/?q=lat,lng` centres
 *   a map. The agent then has to press directions themselves, at the
 *   kerbside, with a buyer waiting. The button's whole purpose was the
 *   one thing it did not do.
 * - **The comment described a third behaviour again** — a
 *   platform-agnostic `geo:` URL — which the code had never produced.
 *
 * A link is exactly the kind of thing that looks right and is not: it
 * renders, it is blue, it is clickable, and it goes somewhere useless.
 * So this asserts the shape of every URL the product builds, against
 * the rules each provider actually documents.
 */
import {
  dial, whatsapp, directions, waze,
} from "../src/lib/contact";

let failed = 0;
function ok(what: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
}

console.log("Contact links\n");

// ---- WhatsApp -------------------------------------------------------
const wa = whatsapp("+971 (0) 55 316 8157");
ok("a UAE number written with (0) loses it", wa === "https://wa.me/971553168157", String(wa));
ok("no plus, no spaces, no punctuation",
   !!wa && /^https:\/\/wa\.me\/\d{8,15}$/.test(wa), String(wa));
ok("a plain international number is unchanged",
   whatsapp("+971501000001") === "https://wa.me/971501000001");
ok("a pre-filled message is encoded, not appended raw",
   whatsapp("+971501000001", "I'm here at Marina Gate 2")
     === "https://wa.me/971501000001?text=I'm%20here%20at%20Marina%20Gate%202");
ok("nothing in, nothing out", whatsapp(null) === null && whatsapp("12") === null);

// ---- Directions -----------------------------------------------------
const d = directions({ lat: 25.0805, lng: 55.1403 });
ok("directions route rather than drop a pin",
   !!d && d.includes("/maps/dir/") && d.includes("api=1"), String(d));
ok("the destination is the coordinates",
   !!d && d.endsWith("destination=25.0805,55.1403"), String(d));
ok("the travel mode is chosen for the agent", !!d && d.includes("travelmode=driving"));
const dAddr = directions({ building: "Marina Gate 2", address: "unit 4104" });
ok("an address falls back to a routed search, still to Dubai",
   !!dAddr && dAddr.includes("/maps/dir/") && dAddr.includes("Dubai"), String(dAddr));
ok("nowhere to go is null", directions({}) === null);

// ---- Waze -----------------------------------------------------------
const w = waze({ lat: 25.0805, lng: 55.1403 });
ok("waze navigates rather than centres",
   !!w && w.includes("navigate=yes"), String(w));

// ---- Dial -----------------------------------------------------------
ok("a phone number dials", dial("+971 50 100 0001") === "tel:+971501000001");
ok("a short string does not", dial("123") === null);

// ---- Every URL is a URL ---------------------------------------------
for (const [name, url] of Object.entries({ wa, d, dAddr, w })) {
  if (!url) continue;
  let parsed = true;
  try { new URL(url); } catch { parsed = false; }
  ok(`${name} parses as a URL`, parsed, url);
  ok(`${name} is https`, url.startsWith("https://"), url);
}

console.log(failed === 0
  ? "\n  every link an agent taps is built the way its provider documents.\n"
  : `\n  ${failed} link(s) wrong.\n`);
process.exit(failed === 0 ? 0 : 1);
