/**
 * glucoseBot.ts (face-emoji branch) — the Bubble bot that shows an animated
 * "NOT-man" face whose EXPRESSION is the blood glucose. No text, no graph.
 *
 *   bun run bot     (needs BOT_TOKEN + Dexcom creds + GIF_PUBLIC_BASE_URL in .env)
 *
 * Flow: every INTERVAL, fetch 6h of Dexcom Share -> assess the level -> render a
 * 32x16 animated face GIF -> publish it -> talPlayGif on the mug.
 *
 * NOTE: the SDK files under ./sdk are third-party (jeejio) and are fetched by
 * `bun run setup`; they are gitignored, not committed.
 */
// @ts-ignore  — bundled SDK, no type declarations
import { BotManager, InlineKeyBoard } from "../sdk/Bot_0.2.js";
// @ts-ignore
import PixelMug from "../sdk/DeviceSDK_PixelMug_0.1.ts";

import { publishGif } from "./hosting";
import { DexcomShare, type Reading } from "./dexcom";
import { assess, DEFAULT_THRESHOLDS, type AlertThresholds } from "./alerts";
import { expressionForLevel } from "./face";
import { faceGif, faceSource } from "./facepack";
import { syntheticReadings } from "./synthetic";

// ---------- config ----------
const token = requireEnv("BOT_TOKEN");
const intervalMs = Number(process.env.INTERVAL_MS ?? 5 * 60 * 1000);
const useSynthetic = !process.env.DEXCOM_USERNAME; // fall back to fake data for demos

const thresholds: AlertThresholds = {
  lowUrgent: Number(process.env.LOW_URGENT ?? DEFAULT_THRESHOLDS.lowUrgent),
  highUrgent: Number(process.env.HIGH_URGENT ?? DEFAULT_THRESHOLDS.highUrgent),
  predWindowMin: Number(process.env.PRED_WINDOW_MIN ?? DEFAULT_THRESHOLDS.predWindowMin),
};

const dex = useSynthetic
  ? null
  : new DexcomShare({
      username: process.env.DEXCOM_USERNAME!,
      password: requireEnv("DEXCOM_PASSWORD"),
      region: (process.env.DEXCOM_REGION as any) ?? "eu",
    });

// ---------- runtime state ----------
let activeChat: any = null; // where to push proactive updates (set on /start)
let timer: ReturnType<typeof setInterval> | null = null;

// ---------- bot wiring ----------
const bot = new BotManager(token);
const mug = new PixelMug();
bot.bindDevices(mug);

bot.setMyCommands([{ command: "start", description: "Start the glucose face" }]);

async function fetchReadings(): Promise<Reading[]> {
  if (useSynthetic) return syntheticReadings("calm");
  return dex!.fetchSeries(6);
}

/** Push a GIF to the mug via talPlayGif. Returns the hosted url, or null if unhosted. */
async function pushGif(chat: any, bytes: Uint8Array): Promise<string | null> {
  const { url } = publishGif(bytes);
  if (!url) return null;
  await bot.setDevMessage(chat, mug, {
    method: "talPlayGif",
    params: { gifContent: { size: bytes.length, type: "image/gif", url } },
  });
  return url;
}

/** Fetch -> assess -> pick a face expression -> push the animated face. */
async function pushGlucose(chat: any): Promise<string> {
  const readings = await fetchReadings();
  if (!readings.length) return "No glucose data.";
  const last = readings[readings.length - 1];
  const ageMin = (Date.now() - last.ts) / 60000;
  const a = assess(readings, thresholds, Date.now());
  const expr = expressionForLevel(a.level);

  const bytes = faceGif(expr); // pack GIF if configured, else built-in NOT-man
  const url = await pushGif(chat, bytes);
  if (!url) {
    return `Rendered ${bytes.length}B face (${expr}) but GIF_PUBLIC_BASE_URL is unset, so the mug can't fetch it.`;
  }
  return `${last.mmol.toFixed(1)} mmol (${a.level}), age ${ageMin.toFixed(0)}m — face:${expr} (${faceSource(expr)}) sent.`;
}

function startLoop(chat: any) {
  stopLoop();
  activeChat = chat;
  void pushGlucose(chat).then((s) => bot.sendMessage(chat, s)).catch((e) => bot.sendMessage(chat, `Push failed: ${e.message}`));
  timer = setInterval(() => {
    void pushGlucose(activeChat).catch((e) => bot.sendMessage(activeChat, `Push failed: ${e.message}`));
  }, intervalMs);
}

function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function panel() {
  const kb = new InlineKeyBoard("Glucose face");
  kb.text("Refresh now", "refresh");
  kb.row();
  kb.text("Cup temp", "temp").text("Battery", "battery");
  kb.row();
  kb.text("Clear display", "clear");
  return kb;
}

bot.on(async (ctx: any) => {
  // 1) device -> bot notifications (charging state) first
  if (ctx?.rpc?.notify?.length) {
    const parsed = mug.parseNotify(ctx.rpc.notify);
    for (const n of parsed) {
      if (n.name === "CurChargingState" && activeChat) {
        await bot.sendMessage(activeChat, `[Mug] ${n.params.value ? "on charger" : "off charger"}`);
      }
    }
    return;
  }

  // 2) /start
  if (ctx?.message?.content === "/start") {
    await bot.sendMessage(ctx.chat, panel());
    startLoop(ctx.chat);
    return;
  }

  // 3) inline-keyboard callbacks
  const cb = String(ctx?.callback?.value ?? "");
  if (!cb) return;

  switch (cb) {
    case "refresh":
      await bot.sendMessage(ctx.chat, await pushGlucose(ctx.chat));
      break;
    case "temp": {
      const res = await bot.setDevMessage(ctx.chat, mug, mug.rpc.talGetCupTemperature());
      await bot.sendMessage(ctx.chat, `Cup temperature: ${JSON.stringify(res?.value ?? res)}`);
      break;
    }
    case "battery": {
      const res = await bot.setDevMessage(ctx.chat, mug, mug.rpc.talGetBatteryLevel());
      await bot.sendMessage(ctx.chat, `Battery: ${JSON.stringify(res?.value ?? res)}`);
      break;
    }
    case "clear":
      await bot.setDevMessage(ctx.chat, mug, mug.rpc.talReturn2Home());
      await bot.sendMessage(ctx.chat, "Display cleared.");
      break;
  }
});

bot.start();
console.log(
  `glucose-face bot running. interval=${intervalMs}ms, data=${useSynthetic ? "synthetic" : "dexcom"}, ` +
    `faces=${process.env.FACE_PACK ? `pack:${process.env.FACE_PACK}` : "built-in"}.`,
);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}
