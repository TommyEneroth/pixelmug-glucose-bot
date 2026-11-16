package se.pixelmug.glucoseface

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * FreeStyle Libre via LibreLinkUp, the follower service behind Abbott's LibreLinkUp app.
 * Unofficial API, the same one Nightscout's librelink-up bridge and xDrip+ use:
 *
 *   POST /llu/auth/login                 -> auth ticket (or a redirect to the user's region)
 *   GET  /llu/connections                -> the patients this follower may see
 *   GET  /llu/connections/{id}/graph     -> ~12 h history (every 15 min) + the latest reading
 *
 * Log in with a follower account the Libre user has invited from the LibreLink app.
 * The ticket is kept and reused until it expires, so the 5-minute poll does one login a
 * session instead of one per poll (LibreView rate-limits logins).
 */
class LibreLinkUp(
    private val email: String,
    private val password: String,
    private var base: String = "https://api.libreview.io",
    private val http: OkHttpClient = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build(),
    private val clock: () -> Long = System::currentTimeMillis,
    private val regionBase: (String) -> String = { "https://api-$it.libreview.io" },
) : GlucoseSource {
    private var ticket: String? = null
    private var ticketExpires = 0L
    private var accountId: String? = null
    private var patientId: String? = null

    private class Unauthorized : RuntimeException()

    private fun request(path: String): Request.Builder = Request.Builder().url(base + path)
        .header("product", PRODUCT)
        .header("version", VERSION)
        .header("Accept", "application/json")
        .header("Cache-Control", "no-cache")
        .apply {
            ticket?.let { header("Authorization", "Bearer $it") }
            accountId?.let { header("Account-Id", it) }
        }

    private fun call(req: Request): JSONObject = http.newCall(req).execute().use { r ->
        val t = r.body?.string() ?: ""
        when {
            r.code == 401 -> throw Unauthorized()
            r.code == 429 -> throw RuntimeException("LibreLinkUp: too many requests, it will retry later")
            r.code == 403 -> throw RuntimeException("LibreLinkUp 403: the app version may be outdated (${VERSION})")
            !r.isSuccessful -> throw RuntimeException("LibreLinkUp ${r.code}: ${t.take(120)}")
        }
        try { JSONObject(t) } catch (e: Exception) { throw RuntimeException("LibreLinkUp: unexpected reply") }
    }

    private fun login() {
        ticket = null; accountId = null
        repeat(3) {
            val body = JSONObject().put("email", email).put("password", password).toString()
            val o = call(request("/llu/auth/login").post(body.toRequestBody(JSON)).build())
            val d = o.optJSONObject("data")
            if (d != null && d.optBoolean("redirect")) {
                val region = d.optString("region")
                if (!REGION.matches(region)) throw RuntimeException("LibreLinkUp: unknown region '$region'")
                base = regionBase(region)
                return@repeat
            }
            when (o.optInt("status", -1)) {
                0 -> {
                    val auth = d?.optJSONObject("authTicket")
                    val tok = auth?.optString("token").orEmpty()
                    val uid = d?.optJSONObject("user")?.optString("id").orEmpty()
                    if (tok.isEmpty() || uid.isEmpty()) throw RuntimeException("LibreLinkUp: login reply without a ticket")
                    ticket = tok
                    accountId = Sources.hex("SHA-256", uid)
                    // expires is in seconds; renew a few minutes early
                    ticketExpires = auth!!.optLong("expires", 0L).let { if (it > 0) it * 1000 else clock() + 3_600_000L } - 300_000L
                    return
                }
                2 -> throw RuntimeException("LibreLinkUp: wrong email or password")
                4 -> throw RuntimeException("LibreLinkUp: open the LibreLinkUp app with this account and accept the terms first")
                else -> throw RuntimeException("LibreLinkUp: login failed (status ${o.optInt("status", -1)})")
            }
        }
        throw RuntimeException("LibreLinkUp: too many region redirects")
    }

    private fun findPatient(): String {
        val arr = call(request("/llu/connections").get().build()).optJSONArray("data")
        val id = arr?.optJSONObject(0)?.optString("patientId").orEmpty()
        if (id.isEmpty()) throw RuntimeException(
            "LibreLinkUp: nobody shares with this account yet. Ask the Libre user to invite it in the LibreLink app")
        return id
    }

    private fun readGraph(): List<Reading> {
        if (ticket == null || clock() > ticketExpires) login()
        val pid = patientId ?: findPatient().also { patientId = it }
        return parseGraph(call(request("/llu/connections/$pid/graph").get().build()))
    }

    @Synchronized
    override fun fetchSeries(hours: Int): List<Reading> {
        val all = try { readGraph() } catch (e: Unauthorized) {
            ticket = null; patientId = null
            try { readGraph() } catch (e: Unauthorized) { throw RuntimeException("LibreLinkUp: not signed in (401)") }
        }
        val newest = all.lastOrNull()?.ts ?: return all
        return all.filter { it.ts >= newest - hours * 3_600_000L }
    }

    companion object {
        /** LibreView turns away clients that claim an old app version. */
        const val VERSION = "4.16.0"
        const val PRODUCT = "llu.android"
        private val JSON = "application/json".toMediaType()
        private val REGION = Regex("^[a-z0-9]{2,6}$")

        /** "11/16/2026 2:44:00 PM" in UTC (FactoryTimestamp) -> epoch ms. */
        fun parseTimestamp(s: String?): Long? {
            if (s.isNullOrBlank()) return null
            val f = SimpleDateFormat("M/d/yyyy h:mm:ss a", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC"); isLenient = false
            }
            return try { f.parse(s.trim())?.time } catch (e: Exception) { null }
        }

        private fun reading(o: JSONObject?): Reading? {
            if (o == null) return null
            val mgdl = o.optDouble("ValueInMgPerDl", Double.NaN)
            val ts = parseTimestamp(o.optString("FactoryTimestamp")) ?: return null
            return if (mgdl.isNaN() || mgdl <= 0) null else Reading(mgdl, ts)
        }

        /** The graph reply -> readings, oldest first: the history plus the newest measurement. */
        fun parseGraph(o: JSONObject): List<Reading> {
            val d = o.optJSONObject("data") ?: return emptyList()
            val out = ArrayList<Reading>()
            val g = d.optJSONArray("graphData")
            if (g != null) for (i in 0 until g.length()) reading(g.optJSONObject(i))?.let(out::add)
            reading(d.optJSONObject("connection")?.optJSONObject("glucoseMeasurement"))?.let(out::add)
            val seen = HashSet<Long>()
            return out.sortedBy { it.ts }.filter { seen.add(it.ts) }
        }
    }
}
