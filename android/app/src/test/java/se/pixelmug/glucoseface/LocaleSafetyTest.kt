package se.pixelmug.glucoseface

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Locale

/** Units, templates and the pixel font must not depend on the phone's language. */
class LocaleSafetyTest {
    private lateinit var saved: Locale
    private val k = Units.MGDL_PER_MMOL

    @Before fun remember() { saved = Locale.getDefault() }
    @After fun restore() { Locale.setDefault(saved) }

    @Test fun mmolUsesADotOnCommaLocales() {
        for (l in listOf(Locale("sv", "SE"), Locale.GERMANY, Locale("es", "ES"), Locale.FRANCE)) {
            Locale.setDefault(l)
            assertEquals("2.9", Units.format(2.9 * k, Units.MMOL))
        }
    }

    @Test fun mgdlIsAWholeNumber() {
        assertEquals("52", Units.format(2.9 * k, Units.MGDL))
        assertEquals("245", Units.format(245.4, Units.MGDL))
        assertEquals("?", Units.format(Double.NaN, Units.MGDL))
    }

    @Test fun parseAcceptsCommaAndConvertsToMgdl() {
        assertEquals(3.9 * k, Units.parse("3,9", Units.MMOL)!!, 1e-9)
        assertEquals(70.0, Units.parse(" 70 ", Units.MGDL)!!, 1e-9)
        assertEquals(null, Units.parse("abc", Units.MMOL))
    }

    @Test fun defaultUnitFollowsCountry() {
        assertEquals(Units.MMOL, Units.defaultFor(Locale("sv", "SE")))
        assertEquals(Units.MMOL, Units.defaultFor(Locale.UK))
        assertEquals(Units.MGDL, Units.defaultFor(Locale.US))
        assertEquals(Units.MGDL, Units.defaultFor(Locale.GERMANY))
        assertEquals(Units.MGDL, Units.defaultFor(Locale("es", "ES")))
    }

    @Test fun templateFillsAllPlaceholders() {
        Locale.setDefault(Locale("sv", "SE"))
        val t = "LOW SOON {v} {arr} ~{pred} IN {min} MIN"
        assertEquals("LOW SOON 6.0 ↘ ~2.0 IN 20 MIN", Templates.fill(t, 6.0 * k, 2.0 * k, "↘", Units.MMOL, 20))
        assertEquals("LOW SOON 108 ↘ ~36 IN 15 MIN", Templates.fill(t, 6.0 * k, 2.0 * k, "↘", Units.MGDL, 15))
    }

    @Test fun fontUppercaseIgnoresTurkishLocale() {
        Locale.setDefault(Locale("tr", "TR"))
        assertEquals("HIGH", Font.normalize("high"))
    }

    @Test fun fontKeepsSwedishAndFoldsOtherAccents() {
        assertEquals("LÅGT ÄR ÖVER", Font.normalize("lågt är över"))
        assertEquals("AZUCAR BAJO", Font.normalize("azúcar bajo"))
        assertEquals("NIEDRIG UBER", Font.normalize("niedrig über"))
        assertEquals("GRÖSSE", Font.normalize("größe")) // Ö is in the font, ß becomes SS
        assertEquals("AEBLE O", Font.normalize("æble ø"))
        assertEquals("A-B", Font.normalize("a–b"))
    }

    @Test fun fontRendersEveryCharOfANormalizedEnglishTemplate() {
        val s = Font.normalize(Templates.fill("LOW SOON {v} {arr} ~{pred} IN {min} MIN", 100.0, 60.0, "↘", Units.MGDL, 20))
        val frame = ByteArray(32 * 16)
        Font.draw(frame, 0, 5, s, 1, 32, 16)
        assertTrue(frame.any { it.toInt() == 1 })
        assertTrue(Font.width(s) > 0)
    }
}

class AlertsTest {
    private val k = Units.MGDL_PER_MMOL
    private val now = 1_800_000_000_000L
    private fun series(vararg mmol: Double) =
        mmol.mapIndexed { i, v -> Reading(v * k, now - (mmol.size - 1 - i) * 5 * 60_000L) }

    @Test fun urgentLowAtTheDefaultLimit() {
        assertEquals("urgentLow", Alerts.assess(series(3.2, 3.1, 3.0), now).level)
    }

    @Test fun fallingTowardsLowIsAPreWarning() {
        // 6.0 falling 0.2 mmol/min is ~2.0 in 20 min.
        val a = Alerts.assess(series(8.0, 7.0, 6.0), now)
        assertEquals("predLow", a.level)
        assertEquals("↘", a.arrow)
    }

    @Test fun inRangeAndFlat() {
        val a = Alerts.assess(series(6.0, 6.0, 6.0), now)
        assertEquals("ok", a.level)
        assertEquals("→", a.arrow)
    }

    @Test fun staleAfter16Minutes() {
        val a = Alerts.assess(series(6.0, 6.0), now + 20 * 60_000L)
        assertEquals("stale", a.level)
        assertEquals("sleep", a.expr)
    }

    @Test fun userLimitsAreRespected() {
        val strict = Limits(urgentLow = 70.0, urgentHigh = 250.0, rangeLow = 80.0, rangeHigh = 160.0)
        assertEquals("urgentLow", Alerts.assess(series(3.8, 3.8, 3.8), now, strict).level)
        assertEquals("ok", Alerts.assess(series(3.8, 3.8, 3.8), now).level)
    }

    @Test fun limitsValidation() {
        assertTrue(Limits().isValid())
        assertFalse(Limits(urgentLow = 90.0).isValid())          // above target low
        assertFalse(Limits(rangeHigh = Double.NaN).isValid())    // unparsable field
        assertFalse(Limits(predMin = 0).isValid())
    }

    @Test fun graphRendersInBothUnits() {
        val r = series(5.0, 6.0, 7.0, 8.0)
        for (u in listOf(Units.MMOL, Units.MGDL)) {
            val gif = GraphRender.render(r, now, Limits(), u)
            assertEquals("GIF89a", String(gif.copyOfRange(0, 6)))
        }
        val overlay = GraphRender.renderOverlay(r, now, "LOW 52 ↘", GraphRender.TXT_RED, Limits())
        assertEquals("GIF89a", String(overlay.copyOfRange(0, 6)))
    }
}
