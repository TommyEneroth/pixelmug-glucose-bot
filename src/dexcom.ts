/**
 * dexcom.ts — minimal Dexcom Share follower client (EU / shareous1).
 *
 * Same approach that already works in GlukosRun / Viktcoachen:
 *  - Dexcom Share (real-time), NOT the official 3h-delayed API.
 *  - Two-step auth (AuthenticatePublisherAccount -> LoginPublisherAccountById).
 *  - Session cached in memory; re-auth on empty/failed read.
 *
 * Credentials come from env (never hard-coded, never committed). See .env.example.
 */

const APPLICATION_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db"; // standard Share follower app id

const REGIONS: Record<string, string> = {
  eu: "https://shareous1.dexcom.com/ShareWebServices/Services",
  us: "https://share2.dexcom.com/ShareWebServices/Services",
};

export type Reading = {
  mmol: number;
  mgdl: number;
  trend: string;
  /** epoch ms of the reading (WT) */
  ts: number;
};

export type DexcomConfig = {
  username: string;
  password: string;
  region?: "eu" | "us";
};

function toMmol(mgdl: number): number {
  return Math.round((mgdl / 18.0182) * 10) / 10;
}

// Dexcom sometimes returns a bare quoted GUID; JSON.parse handles it, but we
// read as text and strip quotes to be robust to content-type quirks.
async function postForString(url: string, body: unknown): Promise<string> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const txt = (await r.text()).trim();
  if (!r.ok) throw new Error(`Dexcom ${r.status}: ${txt.slice(0, 200)}`);
  return txt.replace(/^"|"$/g, "");
}

export class DexcomShare {
  private base: string;
  private accountId: string | null = null;
  private sessionId: string | null = null;

  constructor(private cfg: DexcomConfig) {
    this.base = REGIONS[cfg.region ?? "eu"];
  }

  private async login(): Promise<void> {
    this.accountId = await postForString(`${this.base}/General/AuthenticatePublisherAccount`, {
      accountName: this.cfg.username,
      password: this.cfg.password,
      applicationId: APPLICATION_ID,
    });
    this.sessionId = await postForString(`${this.base}/General/LoginPublisherAccountById`, {
      accountId: this.accountId,
      password: this.cfg.password,
      applicationId: APPLICATION_ID,
    });
  }

  private async readRaw(minutes: number, maxCount: number): Promise<any[]> {
    if (!this.sessionId) await this.login();
    const url =
      `${this.base}/Publisher/ReadPublisherLatestGlucoseValues` +
      `?sessionId=${this.sessionId}&minutes=${minutes}&maxCount=${maxCount}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Dexcom read ${r.status}: ${txt.slice(0, 200)}`);
    let arr: any[] = [];
    try {
      arr = JSON.parse(txt);
    } catch {
      arr = [];
    }
    return arr;
  }

  /** Fetch up to `hours` of readings (oldest first). Retries once with fresh session. */
  async fetchSeries(hours = 6): Promise<Reading[]> {
    const minutes = hours * 60;
    const maxCount = Math.ceil((hours * 60) / 5) + 2;
    let raw = await this.readRaw(minutes, maxCount);
    if (raw.length === 0) {
      // empty often means the session was invalidated by another follower app
      this.sessionId = null;
      await this.login();
      raw = await this.readRaw(minutes, maxCount);
    }
    const readings = raw.map(parseReading).filter((x): x is Reading => x !== null);
    readings.sort((a, b) => a.ts - b.ts); // oldest -> newest
    return readings;
  }
}

function parseReading(x: any): Reading | null {
  if (!x || typeof x.Value !== "number") return null;
  const mgdl = x.Value;
  const trend = typeof x.Trend === "string" ? x.Trend : String(x.Trend ?? "");
  const ts = parseWt(x.WT ?? x.ST ?? x.DT);
  return { mgdl, mmol: toMmol(mgdl), trend, ts };
}

// Dexcom timestamps look like "/Date(1699999999999+0000)/"
function parseWt(wt: unknown): number {
  if (typeof wt !== "string") return Date.now();
  const m = wt.match(/\/Date\((\d+)/);
  return m ? Number(m[1]) : Date.now();
}

/** Least-squares slope (mmol/min) over the last `windowMin` minutes. */
export function slopePerMin(readings: Reading[], windowMin = 20): number {
  if (readings.length < 2) return 0;
  const tEnd = readings[readings.length - 1].ts;
  const pts = readings.filter((r) => tEnd - r.ts <= windowMin * 60 * 1000);
  if (pts.length < 2) return 0;
  const t0 = pts[0].ts;
  const xs = pts.map((p) => (p.ts - t0) / 60000);
  const ys = pts.map((p) => p.mmol);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}
