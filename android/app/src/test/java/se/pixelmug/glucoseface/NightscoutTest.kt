package se.pixelmug.glucoseface

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class NightscoutTest {
    private lateinit var server: MockWebServer
    private val now = 1_800_000_000_000L

    @Before fun up() { server = MockWebServer().apply { start() } }
    @After fun down() { server.shutdown() }

    private fun ns(secret: String = "") =
        Nightscout(server.url("/").toString(), secret, clock = { now }, allowHttp = true)

    private val entries = """[
        {"type":"sgv","sgv":120,"date":${now - 60_000}},
        {"type":"mbg","mbg":130,"date":${now - 90_000}},
        {"type":"sgv","sgv":110,"date":${now - 360_000}},
        {"type":"sgv","sgv":110,"date":${now - 360_000}},
        {"type":"sgv","sgv":5,"date":${now - 660_000}}
    ]"""

    @Test fun urlsAreCleanedUp() {
        assertEquals("https://my.site/", Nightscout.normalizeUrl("my.site").toString())
        assertEquals("https://my.site/", Nightscout.normalizeUrl(" https://my.site/api/v1/entries.json ").toString())
        assertEquals("https://my.site/ns", Nightscout.normalizeUrl("https://my.site/ns/").toString())
        assertNull(Nightscout.normalizeUrl("http://my.site"))
        assertNull(Nightscout.normalizeUrl(""))
    }

    @Test fun tellsTokensFromSecrets() {
        assertTrue(Nightscout.isAccessToken("mug-0123456789abcdef"))
        assertEquals(false, Nightscout.isAccessToken("my-long-api-secret"))
    }

    @Test fun parsesOnlySensorValuesOldestFirst() {
        val r = Nightscout.parse(entries)
        assertEquals(listOf(110.0, 120.0), r.map { it.mgdl })
        assertEquals(now - 60_000, r.last().ts)
    }

    @Test fun accessTokenGoesInTheQuery() {
        server.enqueue(MockResponse().setBody(entries))
        val r = ns("mug-0123456789abcdef").fetchSeries(6)
        assertEquals(2, r.size)
        val req = server.takeRequest()
        assertEquals("/api/v1/entries/sgv.json", req.requestUrl!!.encodedPath)
        assertEquals("mug-0123456789abcdef", req.requestUrl!!.queryParameter("token"))
        assertEquals((now - 6 * 3_600_000L).toString(), req.requestUrl!!.queryParameter("find[date][\$gte]"))
        assertNull(req.getHeader("api-secret"))
    }

    @Test fun apiSecretIsSentAsItsSha1() {
        server.enqueue(MockResponse().setBody("[]"))
        ns("my-long-api-secret").fetchSeries(6)
        val req = server.takeRequest()
        assertEquals(Sources.hex("SHA-1", "my-long-api-secret"), req.getHeader("api-secret"))
        assertNull(req.requestUrl!!.queryParameter("token"))
    }

    @Test fun deniedSaysSo() {
        server.enqueue(MockResponse().setResponseCode(401))
        try { ns().fetchSeries(6); fail() } catch (e: RuntimeException) {
            assertTrue(e.message!!, e.message!!.contains("access denied"))
        }
    }
}
