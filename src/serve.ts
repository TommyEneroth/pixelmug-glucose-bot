/**
 * serve.ts — tiny static server for ./out so the mug can download the GIF.
 *
 *   bun run serve                 # serves ./out on http://localhost:8787
 *   PORT=9000 bun run serve
 *
 * On its own this is only reachable on your LAN. To make it public (so the mug's
 * cloud can fetch it), put a tunnel in front and point GIF_PUBLIC_BASE_URL at it:
 *
 *   cloudflared tunnel --url http://localhost:8787
 *   # -> https://something.trycloudflare.com   (use as GIF_PUBLIC_BASE_URL)
 *
 * See HOSTING.md.
 */
import { join, normalize } from "node:path";

const OUT = join(import.meta.dir, "..", "out");
const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    // strip query (cache-buster) and prevent path traversal
    const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = Bun.file(join(OUT, rel === "/" ? "glucose.gif" : rel));
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    });
  },
});

console.log(`serving ${OUT} on http://localhost:${port}  (Ctrl+C to stop)`);
