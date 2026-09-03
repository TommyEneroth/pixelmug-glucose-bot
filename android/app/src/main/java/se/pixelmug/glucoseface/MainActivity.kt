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
        val preview = findViewById<ImageView>(R.id.preview)
        val mode = findViewById<RadioGroup>(R.id.mode)
        val mug = findViewById<RadioGroup>(R.id.mug)
        val tplLow = findViewById<EditText>(R.id.tplLow)
        val tplHigh = findViewById<EditText>(R.id.tplHigh)
        val tplPredLow = findViewById<EditText>(R.id.tplPredLow)
        val tplPredHigh = findViewById<EditText>(R.id.tplPredHigh)
        val tplOk = findViewById<EditText>(R.id.tplOk)
        val tplStale = findViewById<EditText>(R.id.tplStale)
        val status = findViewById<TextView>(R.id.status)

        mode.check(when (prefs.mode) { "text" -> R.id.modeText; "graph" -> R.id.modeGraph; else -> R.id.modeFace })
        mug.check(if (prefs.mugDark) R.id.mugBlack else R.id.mugWhite)
        tplLow.setText(prefs.tplLow); tplHigh.setText(prefs.tplHigh)
        tplPredLow.setText(prefs.tplPredLow); tplPredHigh.setText(prefs.tplPredHigh)
        tplOk.setText(prefs.tplOk); tplStale.setText(prefs.tplStale)

        token.setText(prefs.token)
        dexUser.setText(prefs.dexUser)
        dexPass.setText(prefs.dexPass)
        gifBase.setText(prefs.gifBase)
        when (prefs.pack) {
            "mumin" -> pack.check(R.id.packMumin)
            "pacman" -> pack.check(R.id.packPacman)
            "emoji" -> pack.check(R.id.packEmoji)
            "notman" -> pack.check(R.id.packNotman)
            else -> pack.check(R.id.packSnobben)
        }

        fun updatePreview() {
            val d = mug.checkedRadioButtonId == R.id.mugBlack
            preview.setImageResource(when (pack.checkedRadioButtonId) {
                R.id.packMumin -> if (d) R.drawable.preview_mumin_dark else R.drawable.preview_mumin
                R.id.packPacman -> if (d) R.drawable.preview_pacman_dark else R.drawable.preview_pacman
                R.id.packEmoji -> if (d) R.drawable.preview_emoji_dark else R.drawable.preview_emoji
                R.id.packNotman -> if (d) R.drawable.preview_notman_dark else R.drawable.preview_notman
                else -> if (d) R.drawable.preview_snobben_dark else R.drawable.preview_snobben
            })
        }
        updatePreview()
        pack.setOnCheckedChangeListener { _, _ -> updatePreview() }
        mug.setOnCheckedChangeListener { _, _ -> updatePreview() }

        fun save() {
            prefs.token = token.text.toString().trim()
            prefs.dexUser = dexUser.text.toString().trim()
            prefs.dexPass = dexPass.text.toString()
            prefs.gifBase = gifBase.text.toString().trim()
            prefs.pack = when (pack.checkedRadioButtonId) {
                R.id.packMumin -> "mumin"; R.id.packPacman -> "pacman"
                R.id.packEmoji -> "emoji"; R.id.packNotman -> "notman"; else -> "snobben"
            }
            prefs.mode = when (mode.checkedRadioButtonId) {
                R.id.modeText -> "text"; R.id.modeGraph -> "graph"; else -> "face"
            }
            prefs.mugDark = mug.checkedRadioButtonId == R.id.mugBlack
            prefs.tplLow = tplLow.text.toString(); prefs.tplHigh = tplHigh.text.toString()
            prefs.tplPredLow = tplPredLow.text.toString(); prefs.tplPredHigh = tplPredHigh.text.toString()
            prefs.tplOk = tplOk.text.toString(); prefs.tplStale = tplStale.text.toString()
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
            save(); status.text = "Skickar test…"
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        if (prefs.chat.isBlank()) return@withContext "Koppla muggen först."
                        val bot = BubbleBot(prefs.token)
                        when (prefs.mode) {
                            "text" -> {
                                val txt = prefs.tplLow.replace("{v}", "2.9").replace("{arr}", "↘").replace("{pred}", "2.0").trim()
                                if (txt.isBlank()) return@withContext "Tom mall."
                                bot.pushText(JSONObject(prefs.chat), txt, "#ff2b2b")
                                "Skickade text: \"$txt\""
                            }
                            "graph" -> {
                                if (prefs.dexUser.isBlank()) return@withContext "Fyll i Dexcom först."
                                val readings = Dexcom(prefs.dexUser, prefs.dexPass, prefs.region).fetchSeries(6)
                                // demo the text-over-graph overlay with a sample low warning
                                val txt = prefs.tplLow.replace("{v}", "2.9").replace("{arr}", "↘").replace("{pred}", "2.0").trim()
                                val gif = GraphRender.renderOverlay(readings, System.currentTimeMillis(), txt, GraphRender.TXT_RED)
                                val url = bot.uploadCatbox(gif)
                                if (!url.startsWith("http")) return@withContext "Uppladdning: ${url.take(60)}"
                                bot.pushGif(JSONObject(prefs.chat), url, gif.size.toLong())
                                "Graf+text (${gif.size} B) uppladdad & skickad"
                            }
                            else -> {
                                val url = prefs.gifUrl("happy")
                                val size = bot.gifSize(url)
                                if (size <= 0L) return@withContext "GIF saknas: $url"
                                bot.pushGif(JSONObject(prefs.chat), url, size)
                                "Skickade happy ($size B)"
                            }
                        }
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
