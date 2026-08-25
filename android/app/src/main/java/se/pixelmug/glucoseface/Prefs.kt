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

    /** The Bubble chat (JSON) the mug is attached to; captured from the platform. */
    var chat: String
        get() = sp.getString("chat", "") ?: ""
        set(v) = sp.edit().putString("chat", v).apply()

    fun gifUrl(expr: String): String = "$gifBase/packs/$pack/$expr.gif"
}
