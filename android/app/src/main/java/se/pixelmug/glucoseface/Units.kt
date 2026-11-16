package se.pixelmug.glucoseface

import java.util.Locale

/**
 * Glucose units. Everything is computed in mg/dL, which is what Dexcom sends;
 * mmol/L only exists at the edges (what the user types and what the mug shows).
 */
object Units {
    const val MMOL = "mmol"
    const val MGDL = "mgdl"
    const val MGDL_PER_MMOL = 18.0182

    // Countries whose diabetes care reports glucose in mmol/L. Everyone else
    // defaults to mg/dL; the user can always switch.
    private val MMOL_COUNTRIES = setOf(
        "SE", "NO", "DK", "FI", "IS", "GB", "IE", "NL", "CA", "AU", "NZ", "ZA",
        "CZ", "SK", "EE", "LV", "LT", "SI", "HR", "RU", "UA", "BY", "KZ", "CN", "HK", "MY", "SG",
    )

    fun defaultFor(locale: Locale): String =
        if (locale.country.uppercase(Locale.ROOT) in MMOL_COUNTRIES) MMOL else MGDL

    fun toDisplay(mgdl: Double, unit: String) = if (unit == MMOL) mgdl / MGDL_PER_MMOL else mgdl
    fun fromDisplay(v: Double, unit: String) = if (unit == MMOL) v * MGDL_PER_MMOL else v

    /** "5.4" or "97". Always a '.', whatever the phone's language: the pixel font has no ','. */
    fun format(mgdl: Double, unit: String): String = when {
        mgdl.isNaN() -> "?"
        unit == MMOL -> String.format(Locale.US, "%.1f", mgdl / MGDL_PER_MMOL)
        else -> Math.round(mgdl).toString()
    }

    fun label(unit: String) = if (unit == MMOL) "mmol/L" else "mg/dL"

    /** What the user typed, in the unit they see, as mg/dL. Accepts "3,9" as well as "3.9". */
    fun parse(text: String, unit: String): Double? =
        text.trim().replace(',', '.').toDoubleOrNull()?.let { fromDisplay(it, unit) }
}

/** Scroll-text templates. Placeholders: {v} value, {arr} arrow, {pred} prediction, {min} window. */
object Templates {
    fun fill(t: String, cur: Double, pred: Double, arrow: String, unit: String, predMin: Int): String =
        t.replace("{v}", Units.format(cur, unit))
            .replace("{arr}", arrow)
            .replace("{pred}", Units.format(pred, unit))
            .replace("{min}", predMin.toString())
            .trim()
}
