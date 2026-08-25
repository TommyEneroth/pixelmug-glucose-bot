package se.pixelmug.glucoseface

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.*
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val token = findViewById<EditText>(R.id.token)
        val dexUser = findViewById<EditText>(R.id.dexUser)
        val dexPass = findViewById<EditText>(R.id.dexPass)
        val gifBase = findViewById<EditText>(R.id.gifBase)
        val pack = findViewById<RadioGroup>(R.id.pack)
        val status = findViewById<TextView>(R.id.status)

        token.setText(prefs.token)
        dexUser.setText(prefs.dexUser)
        dexPass.setText(prefs.dexPass)
        gifBase.setText(prefs.gifBase)
        when (prefs.pack) {
            "pacman" -> pack.check(R.id.packPacman)
            "emoji" -> pack.check(R.id.packEmoji)
            else -> pack.check(R.id.packSnobben)
        }

        fun save() {
            prefs.token = token.text.toString().trim()
            prefs.dexUser = dexUser.text.toString().trim()
            prefs.dexPass = dexPass.text.toString()
            prefs.gifBase = gifBase.text.toString().trim()
            prefs.pack = when (pack.checkedRadioButtonId) {
                R.id.packPacman -> "pacman"; R.id.packEmoji -> "emoji"; else -> "snobben"
            }
        }

        findViewById<Button>(R.id.btnCapture).setOnClickListener {
            save(); status.text = "Öppna Bubble-appen och skicka /start till boten…"
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        val bot = BubbleBot(prefs.token)
                        bot.saveSlots()
                        val chat = bot.captureChat(25000) ?: return@withContext "Ingen chatt fångad — skicka /start i Bubble och försök igen."
                        prefs.chat = chat.toString()
                        "Mugg kopplad ✔  (chatt sparad)"
                    } catch (e: Exception) { "Fel: ${e.message}" }
                }
                status.text = res
            }
        }

        findViewById<Button>(R.id.btnTest).setOnClickListener {
            save(); status.text = "Skickar testbild…"
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        if (prefs.chat.isBlank()) return@withContext "Koppla muggen först."
                        val bot = BubbleBot(prefs.token)
                        val url = prefs.gifUrl("happy")
                        val size = bot.gifSize(url)
                        if (size <= 0L) return@withContext "GIF saknas: $url"
                        bot.pushGif(JSONObject(prefs.chat), url, size)
                        "Skickade happy ($size B) → muggen"
                    } catch (e: Exception) { "Fel: ${e.message}" }
                }
                status.text = res
            }
        }

        findViewById<Button>(R.id.btnStart).setOnClickListener {
            save()
            val i = Intent(this, FaceService::class.java)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
            status.text = "Igång — uppdaterar var 5:e minut."
        }

        findViewById<Button>(R.id.btnStop).setOnClickListener {
            startService(Intent(this, FaceService::class.java).setAction("STOP"))
            status.text = "Stoppad."
        }
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
