/**
 * hosting.ts — the mug downloads the GIF from a PUBLIC url, so the bot must
 * publish the rendered bytes somewhere reachable over the internet.
 *
 * This prototype writes the GIF to ./out and returns `${GIF_PUBLIC_BASE_URL}/<name>`.
 * Point GIF_PUBLIC_BASE_URL at whatever serves ./out publicly:
 *   - a small bucket (Cloudflare R2 / S3) you sync ./out to, or
 *   - the Mac mini exposed via a tunnel (cloudflared / tailscale funnel), or
 *   - any static host.
 *
 * Swap `publishGif` for a direct bucket PUT when you pick a host.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dir, "..", "out");

export function publishGif(bytes: Uint8Array, name = "glucose.gif"): { path: string; url: string | null } {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, name);
  writeFileSync(path, bytes);
  const base = process.env.GIF_PUBLIC_BASE_URL?.replace(/\/$/, "");
  // cache-bust so the mug re-fetches instead of serving a stale cached copy
  const url = base ? `${base}/${name}?t=${nowStamp()}` : null;
  return { path, url };
}

function nowStamp(): number {
  return Math.floor(Date.now() / 1000);
}
