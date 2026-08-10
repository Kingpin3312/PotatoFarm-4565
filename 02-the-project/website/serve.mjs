/**
 * The site, served the way the host will serve it.
 *
 * Everything until now was tested over `file://`, which is not the
 * product. `file://` ignores `_redirects` entirely, ignores `_headers`
 * entirely, resolves `/assets/x.css` against the filesystem root, and
 * treats every page as its own origin so CSP never applies. Four of the
 * things most likely to be wrong on the first deploy are the four things
 * that testing cannot see.
 *
 * So this implements what Cloudflare Pages does — the redirect table in
 * precedence order, the header table by path prefix, clean URLs, and the
 * 404 fallback — and serves it over HTTP. It exists to be pointed at by
 * the pre-deploy check, not to be a production server.
 *
 *     node serve.mjs 4321
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** `_redirects`, in file order — first match wins, as the host does it. */
function redirects() {
  const f = path.join(ROOT, "_redirects");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 3)
    .map(([from, to, code]) => ({ from, to, code: Number(code.replace("!", "")) }));
}

/**
 * `_headers`, keyed by path pattern.
 *
 * Cloudflare applies every matching block, most general first, so a
 * `/*` block and an `/assets/*` block both land on a stylesheet.
 */
function headers() {
  const f = path.join(ROOT, "_headers");
  if (!fs.existsSync(f)) return [];
  const blocks = [];
  let current = null;
  for (const raw of fs.readFileSync(f, "utf8").split("\n")) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), set: {} };
      blocks.push(current);
    } else if (current) {
      const i = line.indexOf(":");
      if (i > 0) current.set[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return blocks;
}

const REDIRECTS = redirects();
const HEADERS = headers();

const matches = (pattern, pathname) =>
  pattern.endsWith("/*")
    ? pathname.startsWith(pattern.slice(0, -1))
    : pattern === pathname;

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  /**
   * Order matters, and I had it backwards.
   *
   * The first version evaluated every redirect before looking for a
   * file, so the catch-all `/*  /404.html  404` swallowed the homepage —
   * and would have swallowed every stylesheet and image too. That is not
   * what the host does, and "fixing" the site to satisfy it would have
   * broken the site.
   *
   * Cloudflare Pages and Netlify both serve an existing static asset
   * first and only then consult the redirect table, which is why the
   * SPA idiom `/*  /index.html  200` does not eat the assets.
   *
   * The one exception is a host-absolute rule. www → apex is about which
   * host answered, not which path was asked for, so it has to run before
   * anything is served or www would quietly serve a full copy of the
   * site.
   */
  for (const r of REDIRECTS) {
    if (!r.from.startsWith("http")) continue;
    const u = new URL(r.from.replace("/*", "/"));
    if (req.headers.host !== u.host) continue;
    res.writeHead(r.code, { Location: r.to.replace(":splat", pathname.replace(/^\//, "")) });
    return res.end();
  }

  // 2. An asset that exists wins over any path rule.
  const direct = pathname === "/" ? "/index.html" : pathname;
  const directFile = path.join(ROOT, direct.replace(/^\//, ""));
  if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
    // Both hosts also 301 /x.html → /x automatically. Reproduced so the
    // canonical form is what a crawler is handed.
    if (direct.endsWith(".html") && direct !== "/index.html" && pathname.endsWith(".html")) {
      res.writeHead(301, { Location: pathname.replace(/\.html$/, "") });
      return res.end();
    }
    return send(res, direct, pathname, 200);
  }

  // 3. Then the path rules.
  for (const r of REDIRECTS) {
    let from = r.from, target = null;
    if (from.startsWith("http")) {
      continue;                                  // handled above
    } else if (from.endsWith("/*")) {
      if (pathname.startsWith(from.slice(0, -1))) target = r.to.replace(":splat", "");
    } else if (from === pathname) {
      target = r.to;
    }
    if (!target) continue;

    if (r.code === 200) {                       // rewrite, URL unchanged
      return send(res, target, pathname, 200);
    }
    if (r.code === 404) {                       // the catch-all
      return send(res, target, pathname, 404);
    }
    res.writeHead(r.code, { Location: target }); // 301 / 302
    return res.end();
  }

  return send(res, "/404.html", pathname, 404);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));

function send(res, rel, requestPath, status) {
  const file = path.join(ROOT, rel.replace(/^\//, ""));
  if (!fs.existsSync(file)) {
    res.writeHead(500, { "content-type": "text/plain" });
    return res.end(`_redirects points at ${rel}, which does not exist`);
  }
  const out = { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" };
  for (const b of HEADERS) if (matches(b.pattern, requestPath)) Object.assign(out, b.set);
  res.writeHead(status, out);
  res.end(fs.readFileSync(file));
}
