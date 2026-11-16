package se.pixelmug.glucoseface

import java.security.MessageDigest

/** Anything that can hand over the last few hours of glucose, in mg/dL, oldest first. */
interface GlucoseSource {
    fun fetchSeries(hours: Int = 6): List<Reading>
}

/**
 * Picks the source the user set up and keeps the client alive between polls, so a login
 * (Dexcom session, LibreLinkUp ticket) is reused instead of redone every 5 minutes.
 * A new client is made only when the source or its credentials change.
 */
object Sources {
    const val DEXCOM = "dexcom"
    const val NIGHTSCOUT = "nightscout"
    const val LIBRE = "libre"

    private var key: String? = null
    private var cached: GlucoseSource? = null

    /** The configured source, or null if its settings are still empty. */
    @Synchronized
    fun from(p: Prefs): GlucoseSource? {
        val k = when (p.source) {
            NIGHTSCOUT -> if (p.nsUrl.isBlank()) null else listOf(NIGHTSCOUT, p.nsUrl, p.nsSecret)
            LIBRE -> if (p.lluEmail.isBlank()) null else listOf(LIBRE, p.lluEmail, p.lluPass)
            else -> if (p.dexUser.isBlank()) null else listOf(DEXCOM, p.dexUser, p.dexPass, p.region)
        }?.joinToString("\u0000") ?: return null
        if (k != key || cached == null) {
            cached = when (p.source) {
                NIGHTSCOUT -> Nightscout(p.nsUrl, p.nsSecret)
                LIBRE -> LibreLinkUp(p.lluEmail, p.lluPass)
                else -> Dexcom(p.dexUser, p.dexPass, p.region)
            }
            key = k
        }
        return cached
    }

    internal fun hex(algo: String, s: String): String =
        MessageDigest.getInstance(algo).digest(s.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
