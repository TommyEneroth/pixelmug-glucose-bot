package se.pixelmug.glucoseface

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Talks to the Bubble platform the same way Bot_0.2.js does, but headless:
 *   - saveSlots(): register the PixelMug on slot 1              POST /bot/slot/save
 *   - captureChat(): long-poll updates to learn the chat        GET  /bot/messages/updates
 *   - pushGif(): show a GIF on the mug                          POST /bot/device/msg
 *
 * The chat is the conversation the mug is attached to; capture it once (user sends
 * a message / attaches the mug to the bot in the Bubble app) and reuse it.
 */
class BubbleBot(private val token: String) {
    private val base = "https://us.jeejio.com/im"
    private val JSON = "application/json".toMediaType()
    private val http = OkHttpClient.Builder()
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(70, TimeUnit.SECONDS)
        .build()

    /** Register the device on slot 1 (talId "PixelMug"), like bindDevices(). */
    fun saveSlots() {
        val body = JSONObject()
            .put("token", token)
            .put("slotList", org.json.JSONArray().put(
                JSONObject().put("slot", 1).put("name", "").put("talId", "PixelMug")))
        post("$base/bot/slot/save", body)
    }

    /** Long-poll updates once; return the chat JSON if a message/attach arrived. */
    fun captureChat(timeoutMillis: Int = 25000): JSONObject? {
        val url = "$base/bot/messages/updates?token=$token&timeoutMillis=$timeoutMillis"
        val req = Request.Builder().url(url).get().build()
        http.newCall(req).execute().use { r ->
            val t = r.body?.string() ?: return null
            val root = try { JSONObject(t) } catch (e: Exception) { return null }
            val arr = root.optJSONArray("result") ?: return null
            val e0 = arr.optJSONObject(0) ?: return null
            return e0.optJSONObject("extend")?.optJSONObject("chat")
        }
    }

    /** Push a GIF (talPlayGif) to the mug on slot 1 within the given chat. */
    fun pushGif(chat: JSONObject, url: String, size: Long) {
        val rpc = JSONObject().put("method", "talPlayGif").put("params",
            JSONObject().put("gifContent", JSONObject()
                .put("size", size).put("type", "image/gif").put("url", url)))
        val body = JSONObject()
            .put("traceId", "and_" + System.currentTimeMillis())
            .put("token", token)
            .put("msg", JSONObject().put("value", rpc))
            .put("slot", 1)
            .put("chat", chat)
        post("$base/bot/device/msg", body)
    }

    /** Byte size of a GIF at `url` (talPlayGif wants the size). */
    fun gifSize(url: String): Long {
        val req = Request.Builder().url(url).get().build()
        http.newCall(req).execute().use { r ->
            return r.body?.bytes()?.size?.toLong() ?: 0L
        }
    }

    private fun post(url: String, body: JSONObject): String {
        val req = Request.Builder().url(url).post(body.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            val t = r.body?.string() ?: ""
            if (!r.isSuccessful) throw RuntimeException("Bubble ${r.code}: ${t.take(160)}")
            return t
        }
    }
}
