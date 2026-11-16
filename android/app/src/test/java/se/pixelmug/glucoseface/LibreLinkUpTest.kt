package se.pixelmug.glucoseface

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class LibreLinkUpTest {
    private lateinit var global: MockWebServer
    private lateinit var eu: MockWebServer
    private val now = 1_800_000_000_000L // 2027-01-15T08:00:00Z

    @Before fun up() {
        global = MockWebServer().apply { start() }
        eu = MockWebServer().apply { start() }
    }
    @After fun down() { global.shutdown(); eu.shutdown() }

    private fun base(s: MockWebServer) = s.url("/").toString().trimEnd('/')
    private fun llu() = LibreLinkUp("follower@example.com", "pw", base(global),
        clock = { now }, regionBase = { r -> assertEquals("eu", r); base(eu) })

    private fun json(s: String) = MockResponse().setBody(s).setHeader("Content-Type", "application/json")
    private val login = json("""{"status":0,"data":{"user":{"id":"user-123"},
        "authTicket":{"token":"TICKET","expires":${now / 1000 + 3600},"duration":3600000}}}""")
    private val connections = json("""{"status":0,"data":[{"patientId":"pat-9","firstName":"A"}]}""")
    private val graph = json("""{"status":0,"data":{
        "connection":{"glucoseMeasurement":{"ValueInMgPerDl":104,"FactoryTimestamp":"1/15/2027 7:59:00 AM","TrendArrow":3}},
        "graphData":[
          {"ValueInMgPerDl":120,"FactoryTimestamp":"1/15/2027 7:30:00 AM"},
          {"ValueInMgPerDl":111,"FactoryTimestamp":"1/15/2027 7:45:00 AM"},
          {"ValueInMgPerDl":90,"FactoryTimestamp":"1/14/2027 6:00:00 PM"}]}}""")

    @Test fun timestampsAreUtc() {
        assertEquals(now, LibreLinkUp.parseTimestamp("1/15/2027 8:00:00 AM"))
        assertEquals(now + 6 * 3_600_000L, LibreLinkUp.parseTimestamp("1/15/2027 2:00:00 PM"))
        assertNull(LibreLinkUp.parseTimestamp("not a date"))
    }

    @Test fun graphIncludesTheLatestReading() {
        val r = LibreLinkUp.parseGraph(JSONObject(graph.getBody()!!.readUtf8()))
        assertEquals(listOf(90.0, 120.0, 111.0, 104.0), r.map { it.mgdl })
    }

    @Test fun followsTheRegionRedirectAndSendsTheRightHeaders() {
        global.enqueue(json("""{"status":0,"data":{"redirect":true,"region":"eu"}}"""))
        eu.enqueue(login); eu.enqueue(connections); eu.enqueue(graph)

        val r = llu().fetchSeries(6)
        assertEquals(listOf(120.0, 111.0, 104.0), r.map { it.mgdl }) // last 6 h only

        val first = global.takeRequest()
        assertEquals("/llu/auth/login", first.path)
        assertEquals(LibreLinkUp.VERSION, first.getHeader("version"))
        assertEquals("llu.android", first.getHeader("product"))
        assertTrue(first.body.readUtf8().contains("follower@example.com"))

        assertEquals("/llu/auth/login", eu.takeRequest().path)
        val conn = eu.takeRequest()
        assertEquals("/llu/connections", conn.path)
        assertEquals("Bearer TICKET", conn.getHeader("Authorization"))
        assertEquals(Sources.hex("SHA-256", "user-123"), conn.getHeader("Account-Id"))
        assertEquals("/llu/connections/pat-9/graph", eu.takeRequest().path)
    }

    @Test fun reusesTheTicketAndLogsInAgainAfter401() {
        global.enqueue(login); global.enqueue(connections); global.enqueue(graph)
        val c = llu()
        c.fetchSeries(6)
        global.enqueue(graph)                       // second poll: no new login
        c.fetchSeries(6)
        assertEquals(4, global.requestCount)

        global.enqueue(MockResponse().setResponseCode(401))
        global.enqueue(login); global.enqueue(connections); global.enqueue(graph)
        assertEquals(3, c.fetchSeries(6).size)
        assertEquals(8, global.requestCount)
    }

    @Test fun wrongPasswordAndTermsGetPlainMessages() {
        global.enqueue(json("""{"status":2,"error":{"message":"notAuthenticated"}}"""))
        try { llu().fetchSeries(6); fail() } catch (e: RuntimeException) {
            assertTrue(e.message!!, e.message!!.contains("wrong email or password"))
        }
        global.enqueue(json("""{"status":4,"data":{"step":{"type":"tou"}}}"""))
        try { llu().fetchSeries(6); fail() } catch (e: RuntimeException) {
            assertTrue(e.message!!, e.message!!.contains("accept the terms"))
        }
    }

    @Test fun noSharedPatientIsExplained() {
        global.enqueue(login); global.enqueue(json("""{"status":0,"data":[]}"""))
        try { llu().fetchSeries(6); fail() } catch (e: RuntimeException) {
            assertTrue(e.message!!, e.message!!.contains("invite"))
        }
    }
}
