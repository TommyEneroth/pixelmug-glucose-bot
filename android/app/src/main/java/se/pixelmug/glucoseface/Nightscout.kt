package se.pixelmug.glucoseface

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/**
 * Nightscout reader: GET /api/v1/entries/sgv.json. Works with any CGM that feeds a
 * Nightscout site (Dexcom, Libre via xDrip+/Juggluco, Medtronic, Eversense, ...).
 *
 * `secret` may be empty (open site), an access token from the Admin tools
 * ("name-0123456789abcdef", sent as ?token=) or the API_SECRET itself (sent as its SHA-1
 * in the api-secret header, as Nightscout expects). A ?token= already in the URL also works.
 */
class Nightscout(
    url: String,
    secret: String,
    private val http: OkHttpClient = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build(),
    private val clock: () -> Long = System::currentTimeMillis,
    allowHttp: Boolean = false, // tests only: a local mock server has no TLS
) : GlucoseSource {
    private val base: HttpUrl
    private val token: String?
    private val apiSecretSha1: String?

    init {
        val u = normalizeUrl(url, allowHttp) ?: throw IllegalArgumentException("Nightscout: not a valid https:// address")
        val s = secret.trim()
        token = u.queryParameter("token") ?: s.takeIf { isAccessToken(it) }
        apiSecretSha1 = s.takeIf { it.isNotEmpty() && !isAccessToken(it) }?.let { Sources.hex("SHA-1", it) }
        base = u.newBuilder().query(null).fragment(null).build()
    }

    override fun fetchSeries(hours: Int): List<Reading> {
        val since = clock() - hours * 3_600_000L
        val url = base.newBuilder()
            .addPathSegments("api/v1/entries/sgv.json")
            .addQueryParameter("count", (hours * 12 + 24).toString())
            .addQueryParameter("find[date][\$gte]", since.toString())
            .apply { token?.let { addQueryParameter("token", it) } }
            .build()
        val req = Request.Builder().url(url).header("Accept", "application/json")
            .apply { apiSecretSha1?.let { header("api-secret", it) } }
            .build()
        http.newCall(req).execute().use { r ->
            val t = r.body?.string() ?: ""
            when {
                r.code == 401 || r.code == 403 ->
                    throw RuntimeException("Nightscout: access denied, check the token or API secret")
                r.code == 404 -> throw RuntimeException("Nightscout: no API at ${base.host}, check the address")
                !r.isSuccessful -> throw RuntimeException("Nightscout ${r.code}: ${t.take(120)}")
            }
            return parse(t).filter { it.ts >= since }
        }
    }

    companion object {
        private val TOKEN = Regex("^[A-Za-z0-9_.]+-[0-9a-f]{16}$")
        fun isAccessToken(s: String) = TOKEN.matches(s)

        /** Adds https:// if missing, drops a trailing /api/... the user may have pasted, refuses http. */
        fun normalizeUrl(raw: String, allowHttp: Boolean = false): HttpUrl? {
            var s = raw.trim()
            if (s.isEmpty()) return null
            if (!s.contains("://")) s = "https://$s"
            val u = s.toHttpUrlOrNull() ?: return null
            if (u.scheme != "https" && !allowHttp) return null
            val segs = u.pathSegments.filter { it.isNotEmpty() }
            val keep = segs.indexOf("api").let { if (it >= 0) segs.take(it) else segs }
            return u.newBuilder().encodedPath("/").apply { keep.forEach { addPathSegment(it) } }.build()
        }

        /** Nightscout entries -> readings, oldest first; skips calibrations and sensor errors. */
        fun parse(json: String): List<Reading> {
            val arr = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
            val out = ArrayList<Reading>()
            val seen = HashSet<Long>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                if (o.optString("type", "sgv") != "sgv") continue
                val mgdl = o.optDouble("sgv", Double.NaN)
                val ts = o.optLong("date", o.optLong("mills", 0L))
                if (mgdl.isNaN() || mgdl < 20 || ts <= 0 || !seen.add(ts)) continue
                out.add(Reading(mgdl, ts))
            }
            return out.sortedBy { it.ts }
        }
    }
}
