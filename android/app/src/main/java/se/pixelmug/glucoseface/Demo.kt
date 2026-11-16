package se.pixelmug.glucoseface

import kotlin.math.PI
import kotlin.math.sin

/**
 * Demo mode for filming: a fixed script of mug states the user steps through by hand or on
 * a timer, with made-up glucose (never real data). Follows the "critic" clip:
 * happy -> worried -> panic -> LOW SOON over the graph -> recovered graph -> happy.
 */
object Demo {
    enum class Kind { FACE, WARNING_GRAPH, GRAPH }
    data class Step(val kind: Kind, val expr: String, val label: Int)

    val STEPS = listOf(
        Step(Kind.FACE, "happy", R.string.demo_step_happy),
        Step(Kind.FACE, "worried", R.string.demo_step_worried),
        Step(Kind.FACE, "panic", R.string.demo_step_panic),
        Step(Kind.WARNING_GRAPH, "", R.string.demo_step_warning),
        Step(Kind.GRAPH, "", R.string.demo_step_recovered),
        Step(Kind.FACE, "happy", R.string.demo_step_happy_again),
    )

    private const val K = Units.MGDL_PER_MMOL
    /** The values in the script: 4.2 now, heading for 3.1. */
    const val WARN_NOW = 4.2 * K
    const val WARN_PRED = 3.1 * K
    const val RECOVERED = 6.1 * K

    private const val STEP_MS = 5 * 60_000L

    /** 6 h, every 5 min, ending `now` (73 points), from an mmol/L shape of the hour 0..6. */
    private fun day(now: Long, shape: (Double) -> Double): List<Reading> =
        (0..72).map { i -> Reading(shape(i / 12.0) * K, now - (72 - i) * STEP_MS) }

    private fun calm(h: Double) = 6.6 + 0.8 * sin(h * PI / 2.2) + 0.3 * sin(h * 1.7 + 1)

    /** A calm morning that slides down over the last 40 min to 4.2. */
    fun fallingSeries(now: Long): List<Reading> = day(now) { h ->
        val start = 6.0 - 40 / 60.0
        if (h < start) calm(h) * (7.0 / calm(start))
        else 7.0 + (WARN_NOW / K - 7.0) * Math.pow((h - start) / (6.0 - start), 1.3)
    }

    /** The same morning, a dip to 3.3 and back up to 6.1 after the juice. */
    fun recoveredSeries(now: Long): List<Reading> = day(now) { h ->
        val fall = 6.0 - 110 / 60.0
        val bottom = 6.0 - 50 / 60.0
        when {
            h < fall -> calm(h) * (7.0 / calm(fall))
            h < bottom -> 7.0 + (3.3 - 7.0) * Math.pow((h - fall) / (bottom - fall), 1.4)
            else -> 3.3 + (RECOVERED / K - 3.3) * Math.pow((h - bottom) / (6.0 - bottom), 0.8)
        }
    }

    /** The scrolling warning, in the user's unit and their own "low soon" text. */
    fun warningText(template: String, unit: String, predMin: Int): String =
        Templates.fill(template, WARN_NOW, WARN_PRED, "↘", unit, predMin)

    fun warningGif(template: String, unit: String, lim: Limits, now: Long): ByteArray =
        GraphRender.renderOverlay(fallingSeries(now), now, warningText(template, unit, lim.predMin),
            GraphRender.TXT_RED, lim)

    fun recoveredGif(unit: String, lim: Limits, now: Long): ByteArray =
        GraphRender.render(recoveredSeries(now), now, lim, unit)
}
