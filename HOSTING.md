# Hosting the GIF

The PixelMug downloads the GIF over the internet, so the file the bot writes to `./out`
must be reachable at a **public URL** (`GIF_PUBLIC_BASE_URL`). Three ways, easiest first.

## Option A — cloudflared quick tunnel (fastest, no account)

```bash
# terminal 1: serve ./out locally
bun run serve                                   # http://localhost:8787

# terminal 2: expose it publicly
cloudflared tunnel --url http://localhost:8787
# prints e.g. https://tidy-otter-1234.trycloudflare.com
```

Put that URL in `.env`:

```
GIF_PUBLIC_BASE_URL=https://tidy-otter-1234.trycloudflare.com
```

Then `bun run bot`. The mug fetches `…/glucose.gif?t=…`. Quick tunnels get a new URL each
run — fine for testing; for a stable URL use a named tunnel or Option C.

Install cloudflared: `brew install cloudflared`.

## Option B — tailscale funnel (stable URL on your tailnet)

```bash
bun run serve
tailscale funnel 8787
```

Use the funnel URL as `GIF_PUBLIC_BASE_URL`.

## Option C — object storage bucket (most robust for always-on)

Sync `./out` to a public bucket and point `GIF_PUBLIC_BASE_URL` at it, e.g. Cloudflare R2 /
S3 with public read. Swap `publishGif` in `src/hosting.ts` for a direct `PUT` on each render
so you don't run a local server at all. Sketch:

```ts
// inside publishGif, after writeFileSync:
await fetch(`${bucketEndpoint}/${name}`, { method: "PUT", body: bytes, headers: {...auth} });
return { path, url: `${GIF_PUBLIC_BASE_URL}/${name}?t=${nowStamp()}` };
```

## Notes
- The server sends `Cache-Control: no-store` and the bot appends `?t=<epoch>` so the mug
  never shows a stale frame.
- Only `./out` is exposed, and path traversal is blocked — but a quick tunnel is still a
  public URL. Don't put anything sensitive in `./out`. A glucose GIF is just colours; it
  carries no number or identity unless you add one.
