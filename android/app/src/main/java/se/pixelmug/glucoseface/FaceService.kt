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

        val readings = Dexcom(prefs.dexUser, prefs.dexPass, prefs.region).fetchSeries(3)
        val a = Alerts.assess(readings, System.currentTimeMillis())
        val url = prefs.gifUrl(a.expr)
        val bot = BubbleBot(token)
        val size = bot.gifSize(url)
        if (size <= 0L) return "GIF saknas på: $url"
        bot.pushGif(JSONObject(chatStr), url, size)
        val cur = if (a.current.isNaN()) "?" else String.format("%.1f", a.current)
        return "$cur mmol (${a.level}) → ${a.expr}"
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
