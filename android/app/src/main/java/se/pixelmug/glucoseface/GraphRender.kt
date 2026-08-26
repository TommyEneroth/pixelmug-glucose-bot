package se.pixelmug.glucoseface

/**
 * Render 6h of glucose as a 32x16 VU-meter GIF (dark background, coloured bars,
 * current value top-left). Mirrors the TS graph version.
 */
object GraphRender {
    private const val W = 32
    private const val H = 16
    private const val Y_LO = 3.0
    private const val Y_HI = 13.0

    // 0 bg,1 band,2 low,3 lowDim,4 inrange,5 inrangeDim,6 high,7 highDim,8 white,9 gray,10 amber
    private val PALETTE = listOf(
        intArrayOf(10, 10, 14), intArrayOf(14, 46, 22), intArrayOf(255, 60, 60), intArrayOf(120, 24, 24),
        intArrayOf(60, 220, 90), intArrayOf(24, 96, 40), intArrayOf(250, 200, 40), intArrayOf(120, 92, 16),
        intArrayOf(245, 245, 245), intArrayOf(120, 120, 120), intArrayOf(255, 149, 0),
    )
    // text colours for the scrolling overlay
    const val TXT_RED = 2
    const val TXT_AMBER = 10
    const val TXT_WHITE = 8

    private val FONT: Map<Char, Array<String>> = mapOf(
        '0' to arrayOf("111", "101", "101", "101", "111"),
        '1' to arrayOf("010", "110", "010", "010", "111"),
        '2' to arrayOf("111", "001", "111", "100", "111"),
        '3' to arrayOf("111", "001", "111", "001", "111"),
        '4' to arrayOf("101", "101", "111", "001", "001"),
        '5' to arrayOf("111", "100", "111", "001", "111"),
        '6' to arrayOf("111", "100", "111", "101", "111"),
        '7' to arrayOf("111", "001", "010", "010", "010"),
        '8' to arrayOf("111", "101", "111", "101", "111"),
        '9' to arrayOf("111", "101", "111", "001", "111"),
        '.' to arrayOf("0", "0", "0", "0", "1"),
        '-' to arrayOf("000", "000", "111", "000", "000"),
    )

    private fun zone(v: Double) = if (v <= 4.5) "low" else if (v <= 12.5) "inrange" else "high"
    private fun full(z: String) = if (z == "low") 2 else if (z == "high") 6 else 4
    private fun dim(z: String) = if (z == "low") 3 else if (z == "high") 7 else 5
    private fun yRow(v: Double): Int {
        val t = ((v - Y_LO) / (Y_HI - Y_LO)).coerceIn(0.0, 1.0)
        return Math.round((1 - t) * (H - 1)).toInt()
    }

    private fun binToCols(series: List<Double>): DoubleArray {
        val out = DoubleArray(W) { Double.NaN }
        if (series.isEmpty()) return out
        val per = series.size.toDouble() / W
        for (c in 0 until W) {
            val a = (c * per).toInt()
            val b = maxOf(a + 1, ((c + 1) * per).toInt())
            val chunk = series.subList(a.coerceIn(0, series.size), b.coerceIn(0, series.size))
            out[c] = if (chunk.isEmpty()) series.last() else chunk.average()
        }
        return out
    }

    private fun drawText(f: ByteArray, x: Int, y: Int, s: String, idx: Int) {
        var cx = x
        for (ch in s) {
            val g = FONT[ch]
            if (g == null) { cx += 4; continue }
            for (r in g.indices) for (c in g[r].indices)
                if (g[r][c] == '1') { val px = cx + c; val py = y + r; if (px in 0 until W && py in 0 until H) f[py * W + px] = idx.toByte() }
            cx += g[0].length + 1
        }
    }

    /** Build the graph background (bars + band + newest emphasis). */
    private fun graphFrame(readings: List<Reading>, nowMs: Long, withNumber: Boolean): ByteArray {
        val f = ByteArray(W * H) { 0 }
        val rHi = yRow(8.0); val rLo = yRow(4.0)
        for (r in minOf(rHi, rLo)..maxOf(rHi, rLo)) for (c in 0 until W) f[r * W + c] = 1

        val cols = binToCols(readings.map { it.mmol })
        for (c in 0 until W) {
            val v = cols[c]; if (v.isNaN()) continue
            val top = yRow(v); val z = zone(v)
            for (r in top until H) f[r * W + c] = (if (r == top) full(z) else dim(z)).toByte()
        }
        val vLast = cols[W - 1]
        val stale = readings.isNotEmpty() && (nowMs - readings.last().ts) / 60000.0 > 16
        if (!vLast.isNaN()) {
            val top = yRow(vLast); val z = zone(vLast)
            for (r in top until H) f[r * W + (W - 1)] = (if (stale) 9 else full(z)).toByte()
        }
        if (withNumber) {
            val cur = if (readings.isEmpty()) Double.NaN else readings.last().mmol
            val txt = if (cur.isNaN() || cur <= 0) "--" else String.format(java.util.Locale.US, "%.1f", cur)
            val col = if (stale) 9 else if (cur.isNaN() || cur <= 0) 8 else when (zone(cur)) { "low" -> 2; "high" -> 6; else -> 8 }
            drawText(f, 1, 1, txt, col)
        }
        return f
    }

    /** Static graph with the value number (normal display). */
    fun render(readings: List<Reading>, nowMs: Long): ByteArray =
        Gif.encode(W, H, PALETTE, graphFrame(readings, nowMs, true))

    /** Warning text scrolling OVER the graph (transparent), as a looping animation. */
    fun renderOverlay(readings: List<Reading>, nowMs: Long, text: String, colorIdx: Int): ByteArray {
        val base = graphFrame(readings, nowMs, false) // graph without number; text carries the value
        val t = Font.normalize(text)
        val tw = Font.width(t)
        val frames = ArrayList<ByteArray>()
        var x = W
        while (x >= -tw) {
            val fr = base.copyOf()
            Font.draw(fr, x, 5, t, colorIdx, W, H)
            frames.add(fr)
            x -= 2
        }
        return Gif.encodeAnimated(W, H, PALETTE, frames, 8)
    }
}
