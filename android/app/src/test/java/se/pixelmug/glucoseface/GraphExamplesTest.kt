package se.pixelmug.glucoseface

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import kotlin.math.PI
import kotlin.math.sin

/**
 * Six realistic 6-hour Dexcom days, run through the app's own Graph-mode pipeline
 * (Alerts.assess -> template -> GraphRender), exactly as FaceService does it.
 *
 * Checks that each day lands on the intended level, and writes the 32x16 GIFs the
 * mug would get to build/graph-examples/<unit>/<state>.gif. The README previews are
 * made from those:  ./gradlew :app:testDebugUnitTest --tests '*GraphExamplesTest*'
 * then  bash scripts/render_previews.sh  (copies them to docs/graph and renders the mug).
 */
class GraphExamplesTest {
    private val k = Units.MGDL_PER_MMOL
    private val step = 5 * 60_000L
    private val t0 = 1_800_000_000_000L
    private val lim = Limits()

    // the English default texts from res/values/strings.xml
    private val tplLow = "LOW {v} {arr}"
    private val tplHigh = "HIGH {v} {arr}"
    private val tplPredLow = "LOW SOON {v} {arr} ~{pred} IN {min} MIN"
    private val tplPredHigh = "HIGH SOON {v} {arr} ~{pred} IN {min} MIN"

    /** 73 readings (6 h, every 5 min) from an mmol/L shape function of the hour (0..6). */
    private fun day(shape: (Double) -> Double): List<Reading> =
        (0..72).map { i -> Reading(shape(i / 12.0) * k, t0 + i * step) }

    private fun wave(h: Double) = 6.6 + 0.9 * sin(h * PI / 2.2) + 0.4 * sin(h * 1.7 + 1)

    /** A calm day for the first hours, then `tail` takes over for the last `mins` minutes. */
    private fun ending(mins: Int, from: Double, to: Double, curve: Double = 1.6): (Double) -> Double = { h ->
        val start = 6.0 - mins / 60.0
        if (h < start) wave(h) * (from / wave(start))
        else {
            val p = (h - start) / (6.0 - start)
            from + (to - from) * Math.pow(p, curve)
        }
    }

    private val scenarios: List<Triple<String, String, List<Reading>>> = listOf(
        Triple("happy", "ok", day { h -> wave(h) }),
        Triple("worried", "predLow", day(ending(45, 7.4, 4.4, 1.2))),
        Triple("panic", "urgentLow", day(ending(60, 7.0, 2.8, 1.1))),
        Triple("queasy", "predHigh", day(ending(50, 7.2, 12.2, 1.4))),
        Triple("sick", "urgentHigh", day { h -> if (h < 3.5) wave(h) else minOf(15.6, 7.3 + (h - 3.5) * 5.5) }),
        Triple("sleep", "stale", day { h -> wave(h) }),
    )

    private fun nowFor(state: String, r: List<Reading>) =
        r.last().ts + if (state == "sleep") 38 * 60_000L else 60_000L

    /** What FaceService pushes in Graph mode for this assessment. */
    private fun graphGif(r: List<Reading>, now: Long, unit: String): ByteArray {
        val a = Alerts.assess(r, now, lim)
        val (tpl, color) = when (a.level) {
            "urgentLow" -> tplLow to GraphRender.TXT_RED
            "urgentHigh" -> tplHigh to GraphRender.TXT_RED
            "predLow" -> tplPredLow to GraphRender.TXT_RED
            "predHigh" -> tplPredHigh to GraphRender.TXT_AMBER
            else -> return GraphRender.render(r, now, lim, unit)
        }
        val txt = Templates.fill(tpl, a.current, a.predicted, a.arrow, unit, lim.predMin)
        return GraphRender.renderOverlay(r, now, txt, color, lim)
    }

    @Test fun eachExampleDayLandsOnItsLevel() {
        for ((state, level, r) in scenarios)
            assertEquals(state, level, Alerts.assess(r, nowFor(state, r), lim).level)
    }

    @Test fun writeExampleGifs() {
        for (unit in listOf(Units.MMOL, Units.MGDL)) {
            val dir = File("build/graph-examples/$unit").apply { mkdirs() }
            for ((state, _, r) in scenarios) {
                val gif = graphGif(r, nowFor(state, r), unit)
                assertEquals("GIF89a", String(gif.copyOfRange(0, 6)))
                assert(gif.size <= 40_000) { "$state: ${gif.size} B is over the mug's 40 KB cap" }
                File(dir, "$state.gif").writeBytes(gif)
            }
        }
    }
}
