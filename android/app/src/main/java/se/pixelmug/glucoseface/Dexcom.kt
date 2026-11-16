package se.pixelmug.glucoseface

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** A glucose reading in mg/dL, as Dexcom sends it. */
data class Reading(val mgdl: Double, val ts: Long)

/**
 * Minimal Dexcom Share follower client — same approach as GlukosRun / Viktcoachen:
 * real-time Share, two-step auth, session cached in memory.
 *
 * region: "eu" = outside the US (shareous1), "us" = US (share2), "jp" = Japan,
 * which has its own server and application id (same values as pydexcom).
 */
class Dexcom(private val user: String, private val pass: String, region: String = "eu") {
    private val base = when (region) {
        "us" -> "https://share2.dexcom.com/ShareWebServices/Services"
        "jp" -> "https://share.dexcom.jp/ShareWebServices/Services"
        else -> "https://shareous1.dexcom.com/ShareWebServices/Services"
    }
    private val appId = if (region == "jp") "d8665ade-9673-4e27-9ff6-92db4ce13d13"
        else "d89443d2-327c-4a6f-89e5-496bbb0317db"
    private val http = OkHttpClient()
    private val JSON = "application/json".toMediaType()
    private var session: String? = null

    private fun postText(url: String, body: JSONObject): String {
        val req = Request.Builder().url(url)
            .post(body.toString().toRequestBody(JSON))
            .header("Accept", "application/json").build()
        http.newCall(req).execute().use { r ->
            val t = (r.body?.string() ?: "").trim()
            if (!r.isSuccessful) throw RuntimeException("Dexcom ${r.code}: ${t.take(160)}")
            return t.trim('"')
        }
    }

    private fun login() {
        val acct = postText("$base/General/AuthenticatePublisherAccount",
            JSONObject().put("accountName", user).put("password", pass).put("applicationId", appId))
        session = postText("$base/General/LoginPublisherAccountById",
            JSONObject().put("accountId", acct).put("password", pass).put("applicationId", appId))
    }

    private fun readRaw(minutes: Int, maxCount: Int): JSONArray {
        if (session == null) login()
        val url = "$base/Publisher/ReadPublisherLatestGlucoseValues?sessionId=$session&minutes=$minutes&maxCount=$maxCount"
        val req = Request.Builder().url(url).post("".toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            val t = r.body?.string() ?: "[]"
            if (!r.isSuccessful) throw RuntimeException("Dexcom read ${r.code}")
            return try { JSONArray(t) } catch (e: Exception) { JSONArray() }
        }
    }

    /** Last `hours` of readings, oldest first. Retries once with a fresh session. */
    fun fetchSeries(hours: Int = 3): List<Reading> {
        val minutes = hours * 60
        val maxCount = (minutes / 5) + 2
        var raw = readRaw(minutes, maxCount)
        if (raw.length() == 0) { session = null; login(); raw = readRaw(minutes, maxCount) }
        val out = ArrayList<Reading>()
        for (i in 0 until raw.length()) {
            val o = raw.optJSONObject(i) ?: continue
            val mgdl = o.optDouble("Value", Double.NaN)
            if (mgdl.isNaN()) continue
            out.add(Reading(mgdl, parseWt(o.optString("WT"))))
        }
        out.sortBy { it.ts }
        return out
    }

    private fun parseWt(wt: String?): Long {
        if (wt == null) return System.currentTimeMillis()
        val m = Regex("/Date\\((\\d+)").find(wt) ?: return System.currentTimeMillis()
        return m.groupValues[1].toLong()
    }
}
