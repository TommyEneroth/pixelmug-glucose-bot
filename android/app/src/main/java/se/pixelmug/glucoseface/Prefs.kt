package se.pixelmug.glucoseface

import android.content.Context
import java.util.Locale

/** Simple persistent settings. Glucose limits are stored in mg/dL. */
class Prefs(private val ctx: Context) {
    private val sp = ctx.getSharedPreferences("glucoseface", Context.MODE_PRIVATE)

    var token: String
        get() = sp.getString("token", "") ?: ""
        set(v) = sp.edit().putString("token", v).apply()

    /** Where glucose comes from: Sources.DEXCOM | NIGHTSCOUT | LIBRE. */
    var source: String
        get() = sp.getString("source", Sources.DEXCOM) ?: Sources.DEXCOM
        set(v) = sp.edit().putString("source", v).apply()

    var nsUrl: String
        get() = sp.getString("nsUrl", "") ?: ""
        set(v) = sp.edit().putString("nsUrl", v).apply()

    /** Nightscout access token or API secret (may be empty for an open site). */
    var nsSecret: String
        get() = sp.getString("nsSecret", "") ?: ""
        set(v) = sp.edit().putString("nsSecret", v).apply()

    var lluEmail: String
        get() = sp.getString("lluEmail", "") ?: ""
        set(v) = sp.edit().putString("lluEmail", v).apply()

    var lluPass: String
        get() = sp.getString("lluPass", "") ?: ""
        set(v) = sp.edit().putString("lluPass", v).apply()

    var dexUser: String
        get() = sp.getString("dexUser", "") ?: ""
        set(v) = sp.edit().putString("dexUser", v).apply()

    var dexPass: String
        get() = sp.getString("dexPass", "") ?: ""
        set(v) = sp.edit().putString("dexPass", v).apply()

    /** Dexcom Share server: "eu" (outside the US), "us" or "jp". */
    var region: String
        get() = sp.getString("region", "eu") ?: "eu"
        set(v) = sp.edit().putString("region", v).apply()

    /**
     * "mmol" or "mgdl". New installs follow the phone's country; installs from before
     * units existed (a Dexcom login is already saved) keep mmol, which was all they had.
     */
    var unit: String
        get() = sp.getString("unit", null)
            ?: if (sp.contains("dexUser")) Units.MMOL else Units.defaultFor(Locale.getDefault())
        set(v) = sp.edit().putString("unit", v).apply()

    var limits: Limits
        get() {
            val d = Limits()
            return Limits(
                urgentLow = sp.getFloat("limUrgentLow", d.urgentLow.toFloat()).toDouble(),
                urgentHigh = sp.getFloat("limUrgentHigh", d.urgentHigh.toFloat()).toDouble(),
                rangeLow = sp.getFloat("limRangeLow", d.rangeLow.toFloat()).toDouble(),
                rangeHigh = sp.getFloat("limRangeHigh", d.rangeHigh.toFloat()).toDouble(),
                predMin = sp.getInt("limPredMin", d.predMin),
            )
        }
        set(v) = sp.edit()
            .putFloat("limUrgentLow", v.urgentLow.toFloat())
            .putFloat("limUrgentHigh", v.urgentHigh.toFloat())
            .putFloat("limRangeLow", v.rangeLow.toFloat())
            .putFloat("limRangeHigh", v.rangeHigh.toFloat())
            .putInt("limPredMin", v.predMin)
            .apply()

    /** Public base URL that serves the pack GIFs, e.g. .../<base>/packs/<pack>/<expr>.gif */
    var gifBase: String
        get() = sp.getString("gifBase", "https://cdn.jsdelivr.net/gh/TommyEneroth/pixelmug-glucose-bot@main") ?: ""
        set(v) = sp.edit().putString("gifBase", v.trimEnd('/')).apply()

    var pack: String
        get() = sp.getString("pack", "snobben") ?: "snobben"
        set(v) = sp.edit().putString("pack", v).apply()

    /** Black mug (S1 Pro) uses the dark pack variants; white mug (P1) the light ones. */
    var mugDark: Boolean
        get() = sp.getBoolean("mugDark", true)
        set(v) = sp.edit().putBoolean("mugDark", v).apply()

    /** Display mode: "face" | "text" | "graph". */
    var mode: String
        get() = sp.getString("mode", "face") ?: "face"
        set(v) = sp.edit().putString("mode", v).apply()

    // Editable scroll-text templates. Defaults come from the phone's language; once
    // saved they are the user's own. Placeholders: {v} {arr} {pred} {min}.
    private fun tpl(key: String, def: Int) = sp.getString("tpl_$key", null) ?: ctx.getString(def)
    private fun setTpl(key: String, v: String) = sp.edit().putString("tpl_$key", v).apply()

    var tplLow: String
        get() = tpl("low", R.string.tpl_low_default); set(v) = setTpl("low", v)
    var tplHigh: String
        get() = tpl("high", R.string.tpl_high_default); set(v) = setTpl("high", v)
    var tplPredLow: String
        get() = tpl("predlow", R.string.tpl_pred_low_default); set(v) = setTpl("predlow", v)
    var tplPredHigh: String
        get() = tpl("predhigh", R.string.tpl_pred_high_default); set(v) = setTpl("predhigh", v)
    var tplOk: String
        get() = tpl("ok", R.string.tpl_ok_default); set(v) = setTpl("ok", v)
    var tplStale: String
        get() = tpl("stale", R.string.tpl_stale_default); set(v) = setTpl("stale", v)

    /** The Bubble chat (JSON) the mug is attached to; captured from the platform. */
    var chat: String
        get() = sp.getString("chat", "") ?: ""
        set(v) = sp.edit().putString("chat", v).apply()

    fun gifUrl(expr: String): String =
        "$gifBase/packs/$pack${if (mugDark) "-dark" else ""}/$expr.gif"
}
