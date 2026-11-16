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
 * Foreground service: every 5 min fetch glucose (Dexcom, Nightscout or LibreLinkUp), pick the face expression, and
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
                NotificationChannel(channelId, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW))
        }
        startForeground(1, notify(getString(R.string.svc_starting)))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopSelf(); return START_NOT_STICKY }
        scope.launch { loop() }
        return START_STICKY
    }

    private suspend fun loop() {
        val intervalMs = 5 * 60 * 1000L
        while (scope.isActive) {
            val status = try { pushOnce() } catch (e: Exception) { getString(R.string.st_error, e.message) }
            update(status)
            delay(intervalMs)
        }
    }

    private fun pushOnce(): String {
        val token = prefs.token
        val chatStr = prefs.chat
        if (token.isBlank()) return getString(R.string.svc_no_token)
        if (chatStr.isBlank()) return getString(R.string.svc_not_connected)
        val source = Sources.from(prefs) ?: return getString(R.string.svc_no_source)

        val now = System.currentTimeMillis()
        val unit = prefs.unit
        val lim = prefs.limits
        val readings = source.fetchSeries(6)
        val a = Alerts.assess(readings, now, lim)
        val chat = JSONObject(chatStr)
        val bot = BubbleBot(token)
        val cur = Units.format(a.current, unit)
        val u = Units.label(unit)

        return when (prefs.mode) {
            "text" -> {
                val (tmpl, color) = templateFor(a.level)
                val txt = fill(tmpl, a, unit, lim)
                if (txt.isBlank()) return getString(R.string.svc_empty_skip, cur, u, a.level)
                bot.pushText(chat, txt, color)
                getString(R.string.svc_text_sent, a.level, txt)
            }
            "graph" -> {
                val warn = a.level in setOf("urgentLow", "urgentHigh", "predLow", "predHigh")
                val gif = if (warn) {
                    val (tmpl, color) = templateFor(a.level)
                    val txt = fill(tmpl, a, unit, lim)
                    val ci = if (color == "#ff9500") GraphRender.TXT_AMBER else GraphRender.TXT_RED
                    if (txt.isBlank()) GraphRender.render(readings, now, lim, unit)
                    else GraphRender.renderOverlay(readings, now, txt, ci, lim) // text scrolls OVER the graph
                } else GraphRender.render(readings, now, lim, unit)
                val url = bot.uploadCatbox(gif)
                if (!url.startsWith("http")) return getString(R.string.st_upload_failed, url.take(80))
                bot.pushGif(chat, url, gif.size.toLong())
                getString(R.string.svc_graph_sent, cur, u, a.level)
            }
            else -> {
                val url = prefs.gifUrl(a.expr)
                val size = bot.gifSize(url)
                if (size <= 0L) return getString(R.string.st_gif_missing, url)
                bot.pushGif(chat, url, size)
                getString(R.string.svc_face_sent, cur, u, a.level, a.expr)
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

    private fun fill(t: String, a: Alerts.Assessment, unit: String, lim: Limits) =
        Templates.fill(t, a.current, a.predicted, a.arrow, unit, lim.predMin)

    private fun update(text: String) {
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(1, notify(text))
    }

    private fun notify(text: String): Notification =
        Notification.Builder(this, channelId)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .build()

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
