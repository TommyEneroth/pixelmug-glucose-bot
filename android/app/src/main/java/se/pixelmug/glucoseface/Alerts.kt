package se.pixelmug.glucoseface

import kotlin.math.max
import kotlin.math.min

/** Level + expression from a glucose series, mirroring alerts.ts / face.ts. */
object Alerts {
    const val LOW_URGENT = 3.0
    const val HIGH_URGENT = 14.0
    const val PRED_WINDOW_MIN = 20.0

    data class Assessment(val level: String, val expr: String, val current: Double, val predicted: Double)

    /** Least-squares slope (mmol/min) over the last 20 min, dedup + span guarded. */
    private fun slopePerMin(readings: List<Reading>): Double {
        if (readings.size < 2) return 0.0
        val tEnd = readings.last().ts
        val seen = HashSet<Long>()
        val pts = readings.filter { tEnd - it.ts <= 20 * 60 * 1000 }.filter { seen.add(it.ts) }
        if (pts.size < 2) return 0.0
        val t0 = pts.first().ts
        if ((tEnd - t0) / 60000.0 < 5) return 0.0
        val xs = pts.map { (it.ts - t0) / 60000.0 }
        val ys = pts.map { it.mmol }
        val n = pts.size
        val sx = xs.sum(); val sy = ys.sum()
        val sxx = xs.sumOf { it * it }
        val sxy = xs.indices.sumOf { xs[it] * ys[it] }
        val denom = n * sxx - sx * sx
        if (denom <= 1e-6) return 0.0
        return max(-1.0, min(1.0, (n * sxy - sx * sy) / denom))
    }

    fun assess(readings: List<Reading>, nowMs: Long): Assessment {
        if (readings.isEmpty()) return Assessment("unknown", "sleep", Double.NaN, Double.NaN)
        val last = readings.last()
        val cur = last.mmol
        val ageMin = (nowMs - last.ts) / 60000.0
        if (cur <= 0) return Assessment("unknown", "sleep", cur, Double.NaN)
        val slope = slopePerMin(readings)
        val pred = max(1.0, min(30.0, cur + slope * PRED_WINDOW_MIN))
        if (ageMin > 16) return Assessment("stale", "sleep", cur, pred)

        val level = when {
            cur <= LOW_URGENT -> "urgentLow"
            cur >= HIGH_URGENT -> "urgentHigh"
            slope < 0 && pred <= LOW_URGENT -> "predLow"
            slope > 0 && pred >= HIGH_URGENT -> "predHigh"
            else -> "ok"
        }
        return Assessment(level, expressionForLevel(level), cur, pred)
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
