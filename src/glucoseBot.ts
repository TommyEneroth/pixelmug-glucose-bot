/**
 * glucoseBot.ts — the Bubble bot that turns a PixelMug P1 into a live
 * blood-glucose VU-meter.
 *
 *   bun run bot     (needs BOT_TOKEN + Dexcom creds + GIF_PUBLIC_BASE_URL in .env)
 *
 * Flow: every INTERVAL, fetch 6h of Dexcom Share data -> render a 32x16 GIF ->
 * publish it to a public URL -> talPlayGif on the mug. Control/config happens
 * from the Bubble chat via an inline keyboard (Telegram-style).
 *
 * NOTE: the SDK files under ./sdk are third-party (jeejio) and are fetched by
 * `bun run setup`; they are gitignored, not committed.
 */
// @ts-ignore  — bundled SDK, no type declarations
import { BotManager, InlineKeyBoard } from "../sdk/Bot_0.2.js";
// @ts-ignore
import PixelMug from "../sdk/DeviceSDK_PixelMug_0.1.ts";
// @ts-ignore  — bundled SDK, no type declarations
import { text2Tal, Specifications } from "../sdk/Text2Params.js";

import { renderGlucoseGif, zone } from "./render";
import { publishGif } from "./hosting";
import { DexcomShare, type Reading } from "./dexcom";
import { assess, DEFAULT_THRESHOLDS, type AlertThresholds } from "./alerts";
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
type Style = "bars" | "spark";
let style: Style = "bars";
let discreet = false; // discreet = colour band only, no numbers (privacy)
let activeChat: any = null; // where to push proactive updates (set on /start)
let timer: ReturnType<typeof setInterval> | null = null;

// ---------- bot wiring ----------
const bot = new BotManager(token);
const mug = new PixelMug();
bot.bindDevices(mug);

bot.setMyCommands([{ command: "start", description: "Start the glucose VU-meter" }]);

async function fetchReadings(): Promise<Reading[]> {
  if (useSynthetic) return syntheticReadings("calm");
  return dex!.fetchSeries(6);
}

/** Send a scrolling coloured warning to the mug. */
async function pushWarning(chat: any, text: string, color: string) {
  const rpc = await text2Tal(text, Specifications.SMALL, color);
  rpc.params.direction = 1; // scroll horizontally
  rpc.params.speed = 60;
  await bot.setDevMessage(chat, mug, rpc);
}

/** Fetch -> assess -> either warn (scrolling text) or show the graph. */
async function pushGlucose(chat: any): Promise<string> {
  const readings = await fetchReadings();
  if (!readings.length) return "No glucose data.";
  const last = readings[readings.length - 1];
  const ageMin = (Date.now() - last.ts) / 60000;

  const a = assess(readings, thresholds, Date.now());

  // Active warning wins: show the scrolling red/amber alert instead of the graph.
  if (a.warning && !discreet) {
    await pushWarning(chat, a.warning.text, a.warning.color);
    return `⚠ ${a.level}: "${a.warning.text}" — now ${a.current.toFixed(1)}, ~${a.predicted.toFixed(1)} in ${thresholds.predWindowMin}m. Warning sent.`;
  }

  const bytes = renderGlucoseGif(
    readings.map((r) => r.mmol),
    {
      style,
      band: true,
      emphasizeLast: true,
      ageMin,
      blinkLow: zone(last.mmol) === "low",
      showValue: !discreet, // discreet mode = colour band only, no number
      currentMmol: last.mmol,
    },
  );
  const { url, path } = publishGif(bytes);

  if (!url) {
    return `Rendered ${bytes.length}B GIF -> ${path}, but GIF_PUBLIC_BASE_URL is unset so the mug can't fetch it. Set it and retry.`;
  }
  await bot.setDevMessage(chat, mug, {
    method: "talPlayGif",
    params: { gifContent: { size: bytes.length, type: "image/gif", url } },
  });
  const arrow = a.slope > 0.02 ? "↗" : a.slope < -0.02 ? "↘" : "→";
  return `${last.mmol.toFixed(1)} mmol ${arrow} (${zone(last.mmol)}), ~${a.predicted.toFixed(1)} in ${thresholds.predWindowMin}m, age ${ageMin.toFixed(0)}m — graph pushed.`;
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
  const kb = new InlineKeyBoard("Glucose VU-meter");
  kb.text("Refresh now", "refresh");
  kb.row();
  kb.text(`Style: ${style === "bars" ? "Bars ✓" : "Bars"}`, "style_bars").text(style === "spark" ? "Spark ✓" : "Spark", "style_spark");
  kb.row();
  kb.text(discreet ? "Discreet ✓" : "Discreet", "discreet").text("Cup temp", "temp").text("Battery", "battery");
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
    case "style_bars":
      style = "bars";
      await bot.sendMessage(ctx.chat, "Style: bars. " + (await pushGlucose(ctx.chat)));
      break;
    case "style_spark":
      style = "spark";
      await bot.sendMessage(ctx.chat, "Style: spark. " + (await pushGlucose(ctx.chat)));
      break;
    case "discreet":
      discreet = !discreet;
      await bot.sendMessage(ctx.chat, `Discreet mode ${discreet ? "on" : "off"}.`);
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
console.log(`glucose-bot running. interval=${intervalMs}ms, source=${useSynthetic ? "synthetic" : "dexcom"}.`);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}
