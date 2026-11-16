package se.pixelmug.glucoseface

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class DemoTest {
    private val now = 1_800_000_000_000L
    private val lim = Limits()
    private val tpl = "LOW SOON {v} {arr} ~{pred} IN {min} MIN" // English default

    @Test fun warningMatchesTheScript() {
        assertEquals("LOW SOON 4.2 ↘ ~3.1 IN 20 MIN", Demo.warningText(tpl, Units.MMOL, 20))
        assertEquals("LOW SOON 76 ↘ ~56 IN 20 MIN", Demo.warningText(tpl, Units.MGDL, 20))
    }

    @Test fun seriesEndNowAtTheScriptedValues() {
        val f = Demo.fallingSeries(now)
        val r = Demo.recoveredSeries(now)
        assertEquals(73, f.size); assertEquals(now, f.last().ts)
        assertEquals(Demo.WARN_NOW, f.last().mgdl, 0.01)
        assertEquals(Demo.RECOVERED, r.last().mgdl, 0.01)
        assertTrue(r.minOf { it.mgdl } < 3.8 * Units.MGDL_PER_MMOL) // the dip is visible
        assertEquals("ok", Alerts.assess(r, now + 60_000, lim).level) // rising, in range, fresh
    }

    @Test fun demoGifsFitTheMugAndAreWrittenForPreview() {
        val dir = File("build/demo").apply { mkdirs() }
        for (unit in listOf(Units.MMOL, Units.MGDL)) {
            val w = Demo.warningGif(tpl, unit, lim, now)
            val g = Demo.recoveredGif(unit, lim, now)
            for (gif in listOf(w, g)) {
                assertEquals("GIF89a", String(gif.copyOfRange(0, 6)))
                assertTrue("${gif.size} B", gif.size <= 40_000)
            }
            File(dir, "warning_$unit.gif").writeBytes(w)
            File(dir, "recovered_$unit.gif").writeBytes(g)
        }
    }

    @Test fun scriptHasTheSixStepsInOrder() {
        assertEquals(listOf("happy", "worried", "panic", "", "", "happy"), Demo.STEPS.map { it.expr })
        assertEquals(Demo.Kind.WARNING_GRAPH, Demo.STEPS[3].kind)
    }
}
