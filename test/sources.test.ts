import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  LibreLinkUp, LLU_VERSION, Nightscout, normalizeNightscoutUrl, parseLluGraph, parseLluTimestamp, parseNightscout,
} from "../src/sources";

const NOW = 1_800_000_000_000; // 2027-01-15T08:00:00Z
const servers: { stop: () => void }[] = [];
afterEach(() => { while (servers.length) servers.pop()!.stop(); });

/** A tiny mock server that answers queued responses and records requests. */
function mock() {
  const queue: Response[] = [];
  const seen: { path: string; headers: Headers; body: string }[] = [];
  const s = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url);
      seen.push({ path: u.pathname + u.search, headers: req.headers, body: await req.text() });
      return queue.shift() ?? new Response("no more", { status: 500 });
    },
  });
  servers.push(s);
  return { base: `http://localhost:${s.port}`, queue, seen, json: (o: unknown, status = 200) => queue.push(Response.json(o, { status })) };
}

describe("Nightscout", () => {
  test("cleans up addresses and refuses http", () => {
    expect(normalizeNightscoutUrl("my.site")!.href).toBe("https://my.site/");
    expect(normalizeNightscoutUrl("https://my.site/api/v1/entries.json")!.href).toBe("https://my.site/");
    expect(normalizeNightscoutUrl("http://my.site")).toBeNull();
  });

  test("keeps sensor values only, oldest first", () => {
    const r = parseNightscout([
      { type: "sgv", sgv: 120, date: NOW - 60_000 }, { type: "mbg", mbg: 130, date: NOW },
      { type: "sgv", sgv: 110, date: NOW - 360_000 }, { type: "sgv", sgv: 110, date: NOW - 360_000 },
    ]);
    expect(r.map((x) => x.mgdl)).toEqual([110, 120]);
  });

  test("token in the query, API secret as SHA-1 header", async () => {
    const m = mock();
    m.json([{ type: "sgv", sgv: 100, date: NOW - 60_000 }]);
    expect((await new Nightscout(m.base, "mug-0123456789abcdef", () => NOW, true).fetchSeries(6)).length).toBe(1);
    expect(m.seen[0].path).toContain("/api/v1/entries/sgv.json?");
    expect(m.seen[0].path).toContain("token=mug-0123456789abcdef");
    m.json([]);
    await new Nightscout(m.base, "my-long-api-secret", () => NOW, true).fetchSeries(6);
    expect(m.seen[1].headers.get("api-secret")).toBe(createHash("sha1").update("my-long-api-secret").digest("hex"));
  });
});

describe("LibreLinkUp", () => {
  const login = { status: 0, data: { user: { id: "user-123" }, authTicket: { token: "TICKET", expires: NOW / 1000 + 3600 } } };
  const graph = { status: 0, data: {
    connection: { glucoseMeasurement: { ValueInMgPerDl: 104, FactoryTimestamp: "1/15/2027 7:59:00 AM" } },
    graphData: [
      { ValueInMgPerDl: 120, FactoryTimestamp: "1/15/2027 7:30:00 AM" },
      { ValueInMgPerDl: 90, FactoryTimestamp: "1/14/2027 6:00:00 PM" },
    ] } };

  test("timestamps are UTC, 12-hour clock", () => {
    expect(parseLluTimestamp("1/15/2027 8:00:00 AM")).toBe(NOW);
    expect(parseLluTimestamp("1/15/2027 12:30:00 AM")).toBe(NOW - 7.5 * 3_600_000);
    expect(parseLluTimestamp("nope")).toBeNull();
    expect(parseLluGraph(graph).map((r) => r.mgdl)).toEqual([90, 120, 104]);
  });

  test("follows the region redirect, sends version + Account-Id, reuses the ticket", async () => {
    const g = mock(), eu = mock();
    g.json({ status: 0, data: { redirect: true, region: "eu" } });
    eu.json(login); eu.json({ status: 0, data: [{ patientId: "pat-9" }] }); eu.json(graph);
    const c = new LibreLinkUp("f@example.com", "pw", g.base, () => NOW, () => eu.base);
    expect((await c.fetchSeries(6)).map((r) => r.mgdl)).toEqual([120, 104]);
    expect(g.seen[0].headers.get("version")).toBe(LLU_VERSION);
    expect(eu.seen[1].headers.get("authorization")).toBe("Bearer TICKET");
    expect(eu.seen[1].headers.get("account-id")).toBe(createHash("sha256").update("user-123").digest("hex"));
    expect(eu.seen[2].path).toBe("/llu/connections/pat-9/graph");
    eu.json(graph);
    await c.fetchSeries(6);
    expect(eu.seen.length).toBe(4); // no second login
  });

  test("wrong password reads plainly", async () => {
    const g = mock();
    g.json({ status: 2, error: { message: "incorrect username/password" } });
    await expect(new LibreLinkUp("f@example.com", "x", g.base).fetchSeries()).rejects.toThrow("wrong email or password");
  });
});
