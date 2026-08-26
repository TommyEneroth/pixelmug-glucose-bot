package se.pixelmug.glucoseface

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Foreground service: every 5 min fetch Dexcom, pick the face expression, and
 * push the matching GIF to the mug. Runs on the phone so no PC/tunnel is needed.
 */
class FaceService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var prefs: Prefs
    private val channelId = "glucoseface"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(channelId) == null) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Glukos-mugg", NotificationManager.IMPORTANCE_LOW))
        }
        startForeground(1, notify("Startar…"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopSelf(); return START_NOT_STICKY }
        scope.launch { loop() }
        return START_STICKY
    }

    private suspend fun loop() {
        val intervalMs = 5 * 60 * 1000L
        while (scope.isActive) {
            val status = try { pushOnce() } catch (e: Exception) { "Fel: ${e.message}" }
            update(status)
            delay(intervalMs)
        }
    }

    private fun pushOnce(): String {
        val token = prefs.token
        val chatStr = prefs.chat
        if (token.isBlank()) return "Saknar bot-token."
        if (chatStr.isBlank()) return "Muggen inte kopplad — tryck Koppla mugg."
        if (prefs.dexUser.isBlank()) return "Saknar Dexcom-inlogg."

        val now = System.currentTimeMillis()
        val readings = Dexcom(prefs.dexUser, prefs.dexPass, prefs.region).fetchSeries(6)
        val a = Alerts.assess(readings, now)
        val chat = JSONObject(chatStr)
        val bot = BubbleBot(token)
        val cur = if (a.current.isNaN()) "?" else String.format("%.1f", a.current)

        return when (prefs.mode) {
            "text" -> {
                val (tmpl, color) = templateFor(a.level)
                val txt = fill(tmpl, a)
                if (txt.isBlank()) return "$cur (${a.level}) — tom mall, hoppar över."
                bot.pushText(chat, txt, color)
                "${a.level}: \"$txt\" — text skickad"
            }
            "graph" -> {
                val warn = a.level in setOf("urgentLow", "urgentHigh", "predLow", "predHigh")
                val gif = if (warn) {
                    val (tmpl, color) = templateFor(a.level)
                    val txt = fill(tmpl, a)
                    val ci = if (color == "#ff9500") GraphRender.TXT_AMBER else GraphRender.TXT_RED
                    if (txt.isBlank()) GraphRender.render(readings, now)
                    else GraphRender.renderOverlay(readings, now, txt, ci) // text scrolls OVER the graph
                } else GraphRender.render(readings, now)
                val url = bot.uploadCatbox(gif)
                if (!url.startsWith("http")) return "Uppladdning misslyckades: ${url.take(80)}"
                bot.pushGif(chat, url, gif.size.toLong())
                "$cur mmol (${a.level}) — graf skickad"
            }
            else -> {
                val url = prefs.gifUrl(a.expr)
                val size = bot.gifSize(url)
                if (size <= 0L) return "GIF saknas på: $url"
                bot.pushGif(chat, url, size)
                "$cur mmol (${a.level}) → ${a.expr}"
            }
        }
    }

    private fun templateFor(level: String): Pair<String, String> = when (level) {
        "urgentLow" -> prefs.tplLow to "#ff2b2b"
        "urgentHigh" -> prefs.tplHigh to "#ff2b2b"
        "predLow" -> prefs.tplPredLow to "#ff2b2b"
        "predHigh" -> prefs.tplPredHigh to "#ff9500"
        "stale", "unknown" -> prefs.tplStale to "#9a9aa2"
        else -> prefs.tplOk to "#3cc85a"
    }

    private fun fill(t: String, a: Alerts.Assessment): String {
        val v = if (a.current.isNaN()) "?" else String.format("%.1f", a.current)
        val pred = if (a.predicted.isNaN()) "?" else String.format("%.1f", a.predicted)
        return t.replace("{v}", v).replace("{arr}", a.arrow).replace("{pred}", pred).trim()
    }

    private fun update(text: String) {
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(1, notify(text))
    }

    private fun notify(text: String): Notification =
        Notification.Builder(this, channelId)
            .setContentTitle("Glukos-mugg")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .build()

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
