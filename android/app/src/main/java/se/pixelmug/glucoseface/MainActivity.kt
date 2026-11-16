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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
        val source = findViewById<RadioGroup>(R.id.source)
        val nsUrl = findViewById<EditText>(R.id.nsUrl)
        val nsSecret = findViewById<EditText>(R.id.nsSecret)
        val lluEmail = findViewById<EditText>(R.id.lluEmail)
        val lluPass = findViewById<EditText>(R.id.lluPass)
        val boxDexcom = findViewById<LinearLayout>(R.id.boxDexcom)
        val boxNightscout = findViewById<LinearLayout>(R.id.boxNightscout)
        val boxLibre = findViewById<LinearLayout>(R.id.boxLibre)
        val region = findViewById<RadioGroup>(R.id.region)
        val unit = findViewById<RadioGroup>(R.id.unit)
        val limUrgentLow = findViewById<EditText>(R.id.limUrgentLow)
        val limRangeLow = findViewById<EditText>(R.id.limRangeLow)
        val limRangeHigh = findViewById<EditText>(R.id.limRangeHigh)
        val limUrgentHigh = findViewById<EditText>(R.id.limUrgentHigh)
        val limPredMin = findViewById<EditText>(R.id.limPredMin)
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
        region.check(when (prefs.region) { "us" -> R.id.regionUs; "jp" -> R.id.regionJp; else -> R.id.regionOus })
        unit.check(if (prefs.unit == Units.MGDL) R.id.unitMgdl else R.id.unitMmol)
        tplLow.setText(prefs.tplLow); tplHigh.setText(prefs.tplHigh)
        tplPredLow.setText(prefs.tplPredLow); tplPredHigh.setText(prefs.tplPredHigh)
        tplOk.setText(prefs.tplOk); tplStale.setText(prefs.tplStale)

        // Only the selected source's fields are shown; the others keep what was typed.
        fun showSource() {
            val id = source.checkedRadioButtonId
            boxDexcom.visibility = if (id == R.id.sourceDexcom) android.view.View.VISIBLE else android.view.View.GONE
            boxNightscout.visibility = if (id == R.id.sourceNightscout) android.view.View.VISIBLE else android.view.View.GONE
            boxLibre.visibility = if (id == R.id.sourceLibre) android.view.View.VISIBLE else android.view.View.GONE
        }
        source.check(when (prefs.source) {
            Sources.NIGHTSCOUT -> R.id.sourceNightscout; Sources.LIBRE -> R.id.sourceLibre; else -> R.id.sourceDexcom
        })
        showSource()
        source.setOnCheckedChangeListener { _, _ -> showSource() }
        nsUrl.setText(prefs.nsUrl); nsSecret.setText(prefs.nsSecret)
        lluEmail.setText(prefs.lluEmail); lluPass.setText(prefs.lluPass)

        token.setText(prefs.token)
        dexUser.setText(prefs.dexUser)
        dexPass.setText(prefs.dexPass)
        gifBase.setText(prefs.gifBase)
        when (prefs.pack) {
            "mumin" -> pack.check(R.id.packMumin)
            "pacman" -> pack.check(R.id.packPacman)
            "emoji" -> pack.check(R.id.packEmoji)
            "notman" -> pack.check(R.id.packNotman)
            "weather" -> pack.check(R.id.packWeather)
            "fire" -> pack.check(R.id.packFire)
            "aqua" -> pack.check(R.id.packAqua)
            "lava" -> pack.check(R.id.packLava)
            "matrix" -> pack.check(R.id.packMatrix)
            "space" -> pack.check(R.id.packSpace)
            "synth" -> pack.check(R.id.packSynth)
            else -> pack.check(R.id.packSnobben)
        }

        // Limits are stored in mg/dL and shown in whichever unit is selected.
        val glucoseFields = listOf(limUrgentLow, limRangeLow, limRangeHigh, limUrgentHigh)
        fun selectedUnit() = if (unit.checkedRadioButtonId == R.id.unitMgdl) Units.MGDL else Units.MMOL
        fun showLimits(l: Limits, u: String) {
            listOf(l.urgentLow, l.rangeLow, l.rangeHigh, l.urgentHigh)
                .forEachIndexed { i, v -> glucoseFields[i].setText(Units.format(v, u)) }
            limPredMin.setText(l.predMin.toString())
        }
        var shownUnit = selectedUnit()
        showLimits(prefs.limits, shownUnit)
        // Switching unit converts what's in the fields, including unsaved edits.
        unit.setOnCheckedChangeListener { _, _ ->
            val next = selectedUnit()
            for (f in glucoseFields) {
                val mgdl = Units.parse(f.text.toString(), shownUnit) ?: continue
                f.setText(Units.format(mgdl, next))
            }
            shownUnit = next
        }

        fun updatePreview() {
            val d = mug.checkedRadioButtonId == R.id.mugBlack
            preview.setImageResource(when (pack.checkedRadioButtonId) {
                R.id.packMumin -> if (d) R.drawable.preview_mumin_dark else R.drawable.preview_mumin
                R.id.packPacman -> if (d) R.drawable.preview_pacman_dark else R.drawable.preview_pacman
                R.id.packEmoji -> if (d) R.drawable.preview_emoji_dark else R.drawable.preview_emoji
                R.id.packNotman -> if (d) R.drawable.preview_notman_dark else R.drawable.preview_notman
                R.id.packWeather -> if (d) R.drawable.preview_weather_dark else R.drawable.preview_weather
                R.id.packFire -> if (d) R.drawable.preview_fire_dark else R.drawable.preview_fire
                R.id.packAqua -> if (d) R.drawable.preview_aqua_dark else R.drawable.preview_aqua
                R.id.packLava -> if (d) R.drawable.preview_lava_dark else R.drawable.preview_lava
                R.id.packMatrix -> if (d) R.drawable.preview_matrix_dark else R.drawable.preview_matrix
                R.id.packSpace -> if (d) R.drawable.preview_space_dark else R.drawable.preview_space
                R.id.packSynth -> if (d) R.drawable.preview_synth_dark else R.drawable.preview_synth
                else -> if (d) R.drawable.preview_snobben_dark else R.drawable.preview_snobben
            })
        }
        updatePreview()
        pack.setOnCheckedChangeListener { _, _ -> updatePreview() }
        mug.setOnCheckedChangeListener { _, _ -> updatePreview() }

        /** Saves everything; returns an error message if the limits don't add up (those are then not saved). */
        fun save(): String? {
            prefs.token = token.text.toString().trim()
            prefs.dexUser = dexUser.text.toString().trim()
            prefs.dexPass = dexPass.text.toString()
            prefs.gifBase = gifBase.text.toString().trim()
            prefs.source = when (source.checkedRadioButtonId) {
                R.id.sourceNightscout -> Sources.NIGHTSCOUT; R.id.sourceLibre -> Sources.LIBRE; else -> Sources.DEXCOM
            }
            prefs.nsUrl = nsUrl.text.toString().trim(); prefs.nsSecret = nsSecret.text.toString().trim()
            prefs.lluEmail = lluEmail.text.toString().trim(); prefs.lluPass = lluPass.text.toString()
            prefs.region = when (region.checkedRadioButtonId) {
                R.id.regionUs -> "us"; R.id.regionJp -> "jp"; else -> "eu"
            }
            prefs.pack = when (pack.checkedRadioButtonId) {
                R.id.packMumin -> "mumin"; R.id.packPacman -> "pacman"
                R.id.packEmoji -> "emoji"; R.id.packNotman -> "notman"
                R.id.packWeather -> "weather"; R.id.packFire -> "fire"
                R.id.packAqua -> "aqua"
                R.id.packLava -> "lava"; R.id.packMatrix -> "matrix"
                R.id.packSpace -> "space"; R.id.packSynth -> "synth"; else -> "snobben"
            }
            prefs.mode = when (mode.checkedRadioButtonId) {
                R.id.modeText -> "text"; R.id.modeGraph -> "graph"; else -> "face"
            }
            prefs.mugDark = mug.checkedRadioButtonId == R.id.mugBlack
            prefs.tplLow = tplLow.text.toString(); prefs.tplHigh = tplHigh.text.toString()
            prefs.tplPredLow = tplPredLow.text.toString(); prefs.tplPredHigh = tplPredHigh.text.toString()
            prefs.tplOk = tplOk.text.toString(); prefs.tplStale = tplStale.text.toString()

            val u = selectedUnit()
            prefs.unit = u
            fun mgdl(f: EditText) = Units.parse(f.text.toString(), u) ?: Double.NaN
            val lim = Limits(
                urgentLow = mgdl(limUrgentLow), urgentHigh = mgdl(limUrgentHigh),
                rangeLow = mgdl(limRangeLow), rangeHigh = mgdl(limRangeHigh),
                predMin = limPredMin.text.toString().trim().toIntOrNull() ?: -1,
            )
            if (prefs.source == Sources.NIGHTSCOUT && prefs.nsUrl.isNotBlank() && Nightscout.normalizeUrl(prefs.nsUrl) == null)
                return getString(R.string.st_bad_ns_url)
            if (!lim.isValid()) return getString(R.string.st_bad_limits)
            prefs.limits = lim
            return null
        }

        findViewById<Button>(R.id.btnCapture).setOnClickListener {
            save()?.let { status.text = it; return@setOnClickListener }
            status.text = getString(R.string.st_capture_wait)
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        val bot = BubbleBot(prefs.token)
                        bot.saveSlots()
                        val chat = bot.captureChat(25000) ?: return@withContext getString(R.string.st_capture_none)
                        prefs.chat = chat.toString()
                        getString(R.string.st_capture_ok)
                    } catch (e: Exception) { getString(R.string.st_error, e.message) }
                }
                status.text = res
            }
        }

        findViewById<Button>(R.id.btnTest).setOnClickListener {
            save()?.let { status.text = it; return@setOnClickListener }
            status.text = getString(R.string.st_sending_test)
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        if (prefs.chat.isBlank()) return@withContext getString(R.string.st_connect_first)
                        val bot = BubbleBot(prefs.token)
                        val lim = prefs.limits
                        // A sample urgent low (2.9 heading for 2.0) in the user's own unit.
                        val sample = Templates.fill(prefs.tplLow, 2.9 * Units.MGDL_PER_MMOL,
                            2.0 * Units.MGDL_PER_MMOL, "↘", prefs.unit, lim.predMin)
                        when (prefs.mode) {
                            "text" -> {
                                if (sample.isBlank()) return@withContext getString(R.string.st_empty_template)
                                bot.pushText(JSONObject(prefs.chat), sample, "#ff2b2b")
                                getString(R.string.st_sent_text, sample)
                            }
                            "graph" -> {
                                val source = Sources.from(prefs) ?: return@withContext getString(R.string.st_fill_source)
                                val readings = source.fetchSeries(6)
                                val gif = GraphRender.renderOverlay(readings, System.currentTimeMillis(),
                                    sample, GraphRender.TXT_RED, lim)
                                val url = bot.uploadCatbox(gif)
                                if (!url.startsWith("http")) return@withContext getString(R.string.st_upload_failed, url.take(60))
                                bot.pushGif(JSONObject(prefs.chat), url, gif.size.toLong())
                                getString(R.string.st_sent_graph, gif.size)
                            }
                            else -> {
                                val url = prefs.gifUrl("happy")
                                val size = bot.gifSize(url)
                                if (size <= 0L) return@withContext getString(R.string.st_gif_missing, url)
                                bot.pushGif(JSONObject(prefs.chat), url, size)
                                getString(R.string.st_sent_happy, size)
                            }
                        }
                    } catch (e: Exception) { getString(R.string.st_error, e.message) }
                }
                status.text = res
            }
        }

        // Push a one-off showpiece GIF from packs/extras/ straight to the mug.
        fun pushExtra(file: String, label: String) {
            save()?.let { status.text = it; return }
            status.text = getString(R.string.st_sending, label)
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    try {
                        if (prefs.chat.isBlank()) return@withContext getString(R.string.st_connect_first)
                        val bot = BubbleBot(prefs.token)
                        val url = "${prefs.gifBase}/packs/extras/$file"
                        val size = bot.gifSize(url)
                        if (size <= 0L) return@withContext getString(R.string.st_gif_missing, url)
                        bot.pushGif(JSONObject(prefs.chat), url, size)
                        getString(R.string.st_sent, label, size)
                    } catch (e: Exception) { getString(R.string.st_error, e.message) }
                }
                status.text = res
            }
        }
        findViewById<Button>(R.id.btnHyper).setOnClickListener { pushExtra("hyperspace.gif", getString(R.string.btn_hyper)) }
        findViewById<Button>(R.id.btnNotes).setOnClickListener { pushExtra("notes.gif", getString(R.string.btn_notes)) }

        // ---- demo mode: a scripted scene for filming, made-up values, never real data ----
        val demoStep = findViewById<TextView>(R.id.demoStep)
        val demoSecs = findViewById<EditText>(R.id.demoSecs)
        val btnDemoAuto = findViewById<Button>(R.id.btnDemoAuto)
        val demoLock = Mutex()
        val demoCache = HashMap<Int, Pair<String, Long>>() // step -> (url, size)
        var demoPreparedAt = 0L
        var demoIndex = -1
        var demoAuto: Job? = null

        /** Fetch face sizes and upload the two graphs once, so each step reaches the mug at once. */
        fun prepareDemo(bot: BubbleBot): String? {
            val now = System.currentTimeMillis()
            demoCache.clear()
            Demo.STEPS.forEachIndexed { i, st ->
                demoCache[i] = when (st.kind) {
                    Demo.Kind.FACE -> {
                        val url = prefs.gifUrl(st.expr)
                        val size = bot.gifSize(url)
                        if (size <= 0L) return getString(R.string.st_gif_missing, url)
                        url to size
                    }
                    else -> {
                        val gif = if (st.kind == Demo.Kind.WARNING_GRAPH)
                            Demo.warningGif(prefs.tplPredLow, prefs.unit, prefs.limits, now)
                        else Demo.recoveredGif(prefs.unit, prefs.limits, now)
                        val url = bot.uploadCatbox(gif)
                        if (!url.startsWith("http")) return getString(R.string.st_upload_failed, url.take(60))
                        url to gif.size.toLong()
                    }
                }
            }
            demoPreparedAt = now
            return null
        }

        /** Show step i on the mug. Returns false if it failed (the status says why). */
        suspend fun demoGoTo(i: Int): Boolean = demoLock.withLock {
            save()?.let { status.text = it; return@withLock false }
            if (prefs.chat.isBlank()) { status.text = getString(R.string.st_connect_first); return@withLock false }
            // live updates would overwrite the scene within 5 minutes
            stopService(Intent(this@MainActivity, FaceService::class.java))
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            val err = withContext(Dispatchers.IO) {
                try {
                    val bot = BubbleBot(prefs.token)
                    // litterbox links last an hour; renew well before that
                    if (demoCache.size < Demo.STEPS.size || System.currentTimeMillis() - demoPreparedAt > 45 * 60_000L) {
                        withContext(Dispatchers.Main) { status.text = getString(R.string.st_demo_preparing) }
                        prepareDemo(bot)?.let { return@withContext it }
                        withContext(Dispatchers.Main) { status.text = getString(R.string.st_demo_ready) }
                    }
                    val (url, size) = demoCache.getValue(i)
                    bot.pushGif(JSONObject(prefs.chat), url, size)
                    null
                } catch (e: Exception) { getString(R.string.st_error, e.message) }
            }
            if (err != null) { status.text = err; return@withLock false }
            demoIndex = i
            demoStep.text = getString(R.string.demo_step, i + 1, Demo.STEPS.size, getString(Demo.STEPS[i].label))
            true
        }

        fun stopDemoAuto() { demoAuto?.cancel(); demoAuto = null; btnDemoAuto.setText(R.string.btn_demo_auto) }

        findViewById<Button>(R.id.btnDemoNext).setOnClickListener {
            stopDemoAuto()
            scope.launch { demoGoTo((demoIndex + 1).coerceAtMost(Demo.STEPS.size - 1)) }
        }
        findViewById<Button>(R.id.btnDemoPrev).setOnClickListener {
            stopDemoAuto()
            scope.launch { demoGoTo((demoIndex - 1).coerceAtLeast(0)) }
        }
        btnDemoAuto.setOnClickListener {
            if (demoAuto != null) { stopDemoAuto(); return@setOnClickListener }
            val secs = (demoSecs.text.toString().toIntOrNull() ?: 8).coerceIn(2, 120)
            btnDemoAuto.setText(R.string.btn_demo_auto_stop)
            demoAuto = scope.launch {
                for (i in Demo.STEPS.indices) {
                    if (!demoGoTo(i)) break
                    if (i < Demo.STEPS.size - 1) delay(secs * 1000L)
                }
                demoAuto = null
                btnDemoAuto.setText(R.string.btn_demo_auto)
            }
        }
        findViewById<Button>(R.id.btnDemoEnd).setOnClickListener {
            stopDemoAuto()
            demoIndex = -1
            demoStep.setText(R.string.demo_idle)
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            status.text = getString(R.string.st_demo_ended)
        }

        findViewById<Button>(R.id.btnStart).setOnClickListener {
            save()?.let { status.text = it; return@setOnClickListener }
            val i = Intent(this, FaceService::class.java)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
            status.text = getString(R.string.st_running)
        }

        findViewById<Button>(R.id.btnStop).setOnClickListener {
            startService(Intent(this, FaceService::class.java).setAction("STOP"))
            status.text = getString(R.string.st_stopped)
        }
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
