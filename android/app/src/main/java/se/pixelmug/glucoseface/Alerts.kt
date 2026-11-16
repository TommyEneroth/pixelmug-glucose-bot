package se.pixelmug.glucoseface

import kotlin.math.max
import kotlin.math.min

/** Alarm and target limits, all in mg/dL. Defaults: 3.0 / 14.0 mmol alarms, 70–180 target. */
data class Limits(
    val urgentLow: Double = 3.0 * Units.MGDL_PER_MMOL,
    val urgentHigh: Double = 14.0 * Units.MGDL_PER_MMOL,
    val rangeLow: Double = 70.0,
    val rangeHigh: Double = 180.0,
    val predMin: Int = 20,
) {
    /** False for NaN or out-of-order values, so a typo can't silently disable an alarm. */
    fun isValid() = urgentLow < rangeLow && rangeLow < rangeHigh && rangeHigh < urgentHigh &&
        urgentLow > 0 && predMin in 5..60
}

/** Level + expression from a glucose series, mirroring alerts.ts / face.ts. Works in mg/dL. */
object Alerts {
    data class Assessment(
        val level: String, val expr: String,
        val current: Double, val predicted: Double, val arrow: String,
    )

    // 0.05 mmol/min, the same trend threshold as before, expressed in mg/dL/min.
    private const val FLAT = 0.9

    private fun arrowOf(slope: Double) = when {
        slope > FLAT -> "↗"; slope < -FLAT -> "↘"; else -> "→"
    }

    /** Least-squares slope (mg/dL per min) over the last 20 min, dedup + span guarded. */
    private fun slopePerMin(readings: List<Reading>): Double {
        if (readings.size < 2) return 0.0
        val tEnd = readings.last().ts
        val seen = HashSet<Long>()
        val pts = readings.filter { tEnd - it.ts <= 20 * 60 * 1000 }.filter { seen.add(it.ts) }
        if (pts.size < 2) return 0.0
        val t0 = pts.first().ts
        if ((tEnd - t0) / 60000.0 < 5) return 0.0
        val xs = pts.map { (it.ts - t0) / 60000.0 }
        val ys = pts.map { it.mgdl }
        val n = pts.size
        val sx = xs.sum(); val sy = ys.sum()
        val sxx = xs.sumOf { it * it }
        val sxy = xs.indices.sumOf { xs[it] * ys[it] }
        val denom = n * sxx - sx * sx
        if (denom <= 1e-6) return 0.0
        return max(-18.0, min(18.0, (n * sxy - sx * sy) / denom))
    }

    fun assess(readings: List<Reading>, nowMs: Long, lim: Limits = Limits()): Assessment {
        if (readings.isEmpty()) return Assessment("unknown", "sleep", Double.NaN, Double.NaN, "→")
        val last = readings.last()
        val cur = last.mgdl
        val ageMin = (nowMs - last.ts) / 60000.0
        if (cur <= 0) return Assessment("unknown", "sleep", cur, Double.NaN, "→")
        val slope = slopePerMin(readings)
        val arrow = arrowOf(slope)
        val pred = max(18.0, min(540.0, cur + slope * lim.predMin))
        if (ageMin > 16) return Assessment("stale", "sleep", cur, pred, arrow)

        val level = when {
            cur <= lim.urgentLow -> "urgentLow"
            cur >= lim.urgentHigh -> "urgentHigh"
            slope < 0 && pred <= lim.urgentLow -> "predLow"
            slope > 0 && pred >= lim.urgentHigh -> "predHigh"
            else -> "ok"
        }
        return Assessment(level, expressionForLevel(level), cur, pred, arrow)
    }

    fun expressionForLevel(level: String): String = when (level) {
        "urgentLow" -> "panic"
        "predLow" -> "worried"
        "predHigh" -> "queasy"
        "urgentHigh" -> "sick"
        "stale", "unknown" -> "sleep"
        else -> "happy"
    }
}
