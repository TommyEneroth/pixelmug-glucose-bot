package se.pixelmug.glucoseface

import android.content.Context

/** Simple persistent settings. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("glucoseface", Context.MODE_PRIVATE)

    var token: String
        get() = sp.getString("token", "") ?: ""
        set(v) = sp.edit().putString("token", v).apply()

    var dexUser: String
        get() = sp.getString("dexUser", "") ?: ""
        set(v) = sp.edit().putString("dexUser", v).apply()

    var dexPass: String
        get() = sp.getString("dexPass", "") ?: ""
        set(v) = sp.edit().putString("dexPass", v).apply()

    var region: String
        get() = sp.getString("region", "eu") ?: "eu"
        set(v) = sp.edit().putString("region", v).apply()

    /** Public base URL that serves the pack GIFs, e.g. .../<base>/packs/<pack>/<expr>.gif */
    var gifBase: String
        get() = sp.getString("gifBase", "https://cdn.jsdelivr.net/gh/TommyEneroth/pixelmug-glucose-bot@face-emoji") ?: ""
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

    // Editable scroll-text templates. Placeholders: {v}=value, {arr}=arrow, {pred}=prediction.
    private fun tpl(key: String, def: String) = sp.getString("tpl_$key", def) ?: def
    private fun setTpl(key: String, v: String) = sp.edit().putString("tpl_$key", v).apply()

    var tplLow: String
        get() = tpl("low", "LÅGT {v} {arr} – ÄT NU"); set(v) = setTpl("low", v)
    var tplHigh: String
        get() = tpl("high", "HÖGT {v} {arr}!"); set(v) = setTpl("high", v)
    var tplPredLow: String
        get() = tpl("predlow", "SNART LÅGT {v} {arr} ~{pred} om 20 min"); set(v) = setTpl("predlow", v)
    var tplPredHigh: String
        get() = tpl("predhigh", "SNART HÖGT {v} {arr} ~{pred} om 20 min"); set(v) = setTpl("predhigh", v)
    var tplOk: String
        get() = tpl("ok", "{v} {arr}"); set(v) = setTpl("ok", v)
    var tplStale: String
        get() = tpl("stale", "GAMMALT {v}?"); set(v) = setTpl("stale", v)

    /** The Bubble chat (JSON) the mug is attached to; captured from the platform. */
    var chat: String
        get() = sp.getString("chat", "") ?: ""
        set(v) = sp.edit().putString("chat", v).apply()

    fun gifUrl(expr: String): String =
        "$gifBase/packs/$pack${if (mugDark) "-dark" else ""}/$expr.gif"
}
