import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { getActiveMembership } from "@/server/auth/session";
import { EDITION, PAGE_COUNT } from "@/lib/manual";

/**
 * The training manual's pages and PDF, for signed-in people only.
 *
 * They used to sit in `public/`, where anything with a file extension is
 * served before the sign-in check ever runs (see the matcher in
 * `middleware.ts`), so anybody with the link could read the manual. The
 * owner asked for it to be kept behind sign-in: the files now live in
 * `manual-assets/`, outside `public/`, and this is the only way to them.
 *
 * `/api` is outside the middleware's matcher, so this route checks for
 * itself — the same three things `orgProcedure` does: a session, the
 * second step done if two-step is on, and a brokerage to belong to.
 *
 *     /api/manual/page/07            one page, as an image
 *     /api/manual/pdf                the manual, to read in the browser
 *     /api/manual/pdf?download=1     the manual, to save
 */
const ROOT = path.join(process.cwd(), "manual-assets");
const PDF_NAME = "PotatoFarm-Training-Manual.pdf";

const refuse = () =>
  NextResponse.json({ error: "Sign in to read the training manual." }, { status: 401, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session?.user?.id || session.twoStep === "needed") return refuse();
  if (!(await getActiveMembership())) return refuse();

  const parts = (await params).path;
  // Only these two shapes, built from fixed names: nothing from the URL
  // reaches the file system except a page number checked against the count.
  let file: string, type: string, disposition: string | null = null;
  if (parts.length === 2 && parts[0] === "page" && /^\d{1,3}$/.test(parts[1]!)) {
    const n = Number(parts[1]);
    if (n < 1 || n > PAGE_COUNT) return new NextResponse("No such page.", { status: 404 });
    file = path.join(ROOT, EDITION, `page-${String(n).padStart(2, "0")}.webp`);
    type = "image/webp";
  } else if (parts.length === 1 && parts[0] === "pdf") {
    file = path.join(ROOT, PDF_NAME);
    type = "application/pdf";
    const save = req.nextUrl.searchParams.get("download") === "1";
    disposition = `${save ? "attachment" : "inline"}; filename="${PDF_NAME}"`;
  } else {
    return new NextResponse("Not found.", { status: 404 });
  }

  const body = await readFile(file).catch(() => null);
  if (!body) return new NextResponse("Not found.", { status: 404 });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.length),
      // Private: a shared cache must never hand one person's copy to a
      // stranger. An hour in the reader's own browser keeps paging fast.
      "Cache-Control": "private, max-age=3600",
      ...(disposition ? { "Content-Disposition": disposition } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
