/**
 * sources.ts — Nightscout and LibreLinkUp readers for the bot, with the same
 * fetchSeries(hours) -> Reading[] shape as DexcomShare. Mirrors the Android app's
 * Nightscout.kt / LibreLinkUp.kt (same endpoints, headers and error messages).
 */
import { createHash } from "node:crypto";
import type { Reading } from "./dexcom";

export interface GlucoseSource {
  fetchSeries(hours?: number): Promise<Reading[]>;
}

const toMmol = (mgdl: number) => Math.round((mgdl / 18.0182) * 10) / 10;
const hex = (algo: string, s: string) => createHash(algo).update(s).digest("hex");
const reading = (mgdl: number, ts: number): Reading => ({ mgdl, mmol: toMmol(mgdl), trend: "", ts });

function oldestFirstUnique(rs: Reading[]): Reading[] {
  const seen = new Set<number>();
  return rs.sort((a, b) => a.ts - b.ts).filter((r) => (seen.has(r.ts) ? false : (seen.add(r.ts), true)));
}

// ------------------------------------------------------------------ Nightscout
const NS_TOKEN = /^[A-Za-z0-9_.]+-[0-9a-f]{16}$/;

/** https:// added if missing, a pasted /api/... tail dropped; null for http or garbage. */
export function normalizeNightscoutUrl(raw: string, allowHttp = false): URL | null {
  let s = raw.trim();
  if (!s) return null;
  if (!s.includes("://")) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && !allowHttp) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  const i = segs.indexOf("api");
  u.pathname = "/" + (i >= 0 ? segs.slice(0, i) : segs).join("/");
  return u;
}

export function parseNightscout(entries: unknown): Reading[] {
  if (!Array.isArray(entries)) return [];
  const out: Reading[] = [];
  for (const e of entries as any[]) {
    if ((e?.type ?? "sgv") !== "sgv") continue;
    const ts = Number(e.date ?? e.mills);
    if (typeof e.sgv !== "number" || e.sgv < 20 || !(ts > 0)) continue;
    out.push(reading(e.sgv, ts));
  }
  return oldestFirstUnique(out);
}

export class Nightscout implements GlucoseSource {
  private base: URL;
  private token: string | null;
  private apiSecret: string | null;

  constructor(url: string, secret = "", private now = () => Date.now(), allowHttp = false) {
    const u = normalizeNightscoutUrl(url, allowHttp);
    if (!u) throw new Error("Nightscout: not a valid https:// address");
    const s = secret.trim();
    this.token = u.searchParams.get("token") ?? (NS_TOKEN.test(s) ? s : null);
    this.apiSecret = s && !NS_TOKEN.test(s) ? hex("sha1", s) : null;
    u.search = ""; u.hash = "";
    this.base = u;
  }

  async fetchSeries(hours = 6): Promise<Reading[]> {
    const since = this.now() - hours * 3_600_000;
    const url = new URL(this.base.pathname.replace(/\/$/, "") + "/api/v1/entries/sgv.json", this.base);
    url.searchParams.set("count", String(hours * 12 + 24));
    url.searchParams.set("find[date][$gte]", String(since));
    if (this.token) url.searchParams.set("token", this.token);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiSecret) headers["api-secret"] = this.apiSecret;
    const r = await fetch(url, { headers });
    if (r.status === 401 || r.status === 403) throw new Error("Nightscout: access denied, check the token or API secret");
    if (r.status === 404) throw new Error(`Nightscout: no API at ${this.base.host}, check the address`);
    if (!r.ok) throw new Error(`Nightscout ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return parseNightscout(await r.json().catch(() => [])).filter((x) => x.ts >= since);
  }
}

// ------------------------------------------------------------------ LibreLinkUp
export const LLU_VERSION = "4.16.0"; // LibreView turns away clients claiming an old app version
const LLU_PRODUCT = "llu.android";

/** "1/15/2027 7:59:00 AM" (FactoryTimestamp, UTC) -> epoch ms. */
export function parseLluTimestamp(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[7] === "PM") h += 12;
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), Number(m[6]));
}

export function parseLluGraph(body: any): Reading[] {
  const d = body?.data;
  if (!d) return [];
  const pts = [...(Array.isArray(d.graphData) ? d.graphData : []), d.connection?.glucoseMeasurement];
  const out: Reading[] = [];
  for (const p of pts) {
    const ts = parseLluTimestamp(p?.FactoryTimestamp);
    if (ts !== null && typeof p.ValueInMgPerDl === "number" && p.ValueInMgPerDl > 0) out.push(reading(p.ValueInMgPerDl, ts));
  }
  return oldestFirstUnique(out);
}

class Unauthorized extends Error {}

export class LibreLinkUp implements GlucoseSource {
  private ticket: string | null = null;
  private ticketExpires = 0;
  private accountId: string | null = null;
  private patientId: string | null = null;

  constructor(
    private email: string,
    private password: string,
    private base = "https://api.libreview.io",
    private now = () => Date.now(),
    private regionBase = (r: string) => `https://api-${r}.libreview.io`,
  ) {}

  private async call(path: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = {
      product: LLU_PRODUCT, version: LLU_VERSION, Accept: "application/json", "Cache-Control": "no-cache",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.ticket) headers.Authorization = `Bearer ${this.ticket}`;
    if (this.accountId) headers["Account-Id"] = this.accountId;
    const r = await fetch(this.base + path, {
      method: body === undefined ? "GET" : "POST", headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 401) throw new Unauthorized();
    if (r.status === 429) throw new Error("LibreLinkUp: too many requests, it will retry later");
    if (r.status === 403) throw new Error(`LibreLinkUp 403: the app version may be outdated (${LLU_VERSION})`);
    if (!r.ok) throw new Error(`LibreLinkUp ${r.status}: ${(await r.text()).slice(0, 120)}`);
    try { return await r.json(); } catch { throw new Error("LibreLinkUp: unexpected reply"); }
  }

  private async login(): Promise<void> {
    this.ticket = null; this.accountId = null;
    for (let i = 0; i < 3; i++) {
      const o = await this.call("/llu/auth/login", { email: this.email, password: this.password });
      const d = o?.data;
      if (d?.redirect) {
        if (!/^[a-z0-9]{2,6}$/.test(String(d.region))) throw new Error(`LibreLinkUp: unknown region '${d.region}'`);
        this.base = this.regionBase(d.region);
        continue;
      }
      switch (o?.status) {
        case 0: {
          const tok = d?.authTicket?.token, uid = d?.user?.id;
          if (!tok || !uid) throw new Error("LibreLinkUp: login reply without a ticket");
          this.ticket = tok;
          this.accountId = hex("sha256", uid);
          const exp = Number(d.authTicket.expires);
          this.ticketExpires = (exp > 0 ? exp * 1000 : this.now() + 3_600_000) - 300_000;
          return;
        }
        case 2: throw new Error("LibreLinkUp: wrong email or password");
        case 4: throw new Error("LibreLinkUp: open the LibreLinkUp app with this account and accept the terms first");
        default: throw new Error(`LibreLinkUp: login failed (status ${o?.status})`);
      }
    }
    throw new Error("LibreLinkUp: too many region redirects");
  }

  private async readGraph(): Promise<Reading[]> {
    if (!this.ticket || this.now() > this.ticketExpires) await this.login();
    if (!this.patientId) {
      const id = (await this.call("/llu/connections"))?.data?.[0]?.patientId;
      if (!id) throw new Error("LibreLinkUp: nobody shares with this account yet. Ask the Libre user to invite it in the LibreLink app");
      this.patientId = id;
    }
    return parseLluGraph(await this.call(`/llu/connections/${this.patientId}/graph`));
  }

  async fetchSeries(hours = 6): Promise<Reading[]> {
    let all: Reading[];
    try { all = await this.readGraph(); } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
      this.ticket = null; this.patientId = null;
      try { all = await this.readGraph(); } catch (e2) {
        if (e2 instanceof Unauthorized) throw new Error("LibreLinkUp: not signed in (401)");
        throw e2;
      }
    }
    const newest = all.at(-1)?.ts;
    return newest === undefined ? all : all.filter((r) => r.ts >= newest - hours * 3_600_000);
  }
}
