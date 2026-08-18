# sdk/

These files are the **third-party Bubble / PixelMug SDK**, provided by jeejio:

- `DeviceSDK_PixelMug_0.1.ts` — PixelMug RPC contract (talPlayGif, talGetCupTemperature, …)
- `Bot_0.2.js` — Bubble bot runtime (`BotManager`, `InlineKeyBoard`)
- `Text2Params.js` — text → RPC helper (`text2Tal`, `Specifications`)

They are **not committed** to this repo (see `.gitignore`). Fetch them with:

```bash
bun run setup
```

Source: <https://devstorage.jeejio.com/BubbleSDK/> · docs: <https://github.com/bubble-im>
Do not modify `DeviceSDK_PixelMug_0.1.ts` — it is the device contract.
