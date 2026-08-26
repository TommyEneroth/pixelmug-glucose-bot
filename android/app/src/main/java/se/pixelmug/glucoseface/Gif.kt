package se.pixelmug.glucoseface

import java.io.ByteArrayOutputStream

/**
 * Minimal single-frame GIF89a encoder (indexed, LZW). Ported 1:1 from a Bun
 * reference that was verified to round-trip through PIL. Uses 8-bit LZW (like
 * gifenc) so any palette up to 256 colours works.
 */
object Gif {
    fun encode(width: Int, height: Int, palette: List<IntArray>, indices: ByteArray): ByteArray {
        val bo = ByteArrayOutputStream()
        fun b(v: Int) = bo.write(v and 0xff)
        "GIF89a".forEach { b(it.code) }
        var gctBits = 1; while ((1 shl gctBits) < palette.size) gctBits++
        val gctEntries = 1 shl gctBits
        b(width); b(width shr 8); b(height); b(height shr 8)
        b(0x80 or 0x70 or (gctBits - 1)); b(0); b(0)
        for (i in 0 until gctEntries) {
            val c = if (i < palette.size) palette[i] else intArrayOf(0, 0, 0)
            b(c[0]); b(c[1]); b(c[2])
        }
        b(0x2c); b(0); b(0); b(0); b(0)
        b(width); b(width shr 8); b(height); b(height shr 8); b(0)
        b(8) // LZW min code size
        val lzw = lzw(8, indices)
        var i = 0
        while (i < lzw.size) {
            val n = minOf(255, lzw.size - i)
            b(n); for (j in 0 until n) b(lzw[i + j]); i += n
        }
        b(0); b(0x3b)
        return bo.toByteArray()
    }

    private fun lzw(minCodeSize: Int, data: ByteArray): IntArray {
        val clearCode = 1 shl minCodeSize
        val eoiCode = clearCode + 1
        var codeSize = minCodeSize + 1
        val dict = HashMap<Int, Int>()
        var next = eoiCode + 1
        val bytes = ArrayList<Int>()
        var cur = 0; var curBits = 0
        fun rawEmit(code: Int) {
            cur = cur or (code shl curBits); curBits += codeSize
            while (curBits >= 8) { bytes.add(cur and 0xff); cur = cur ushr 8; curBits -= 8 }
        }
        fun output(code: Int) {
            if (next > (1 shl codeSize) - 1 && codeSize < 12) codeSize++
            rawEmit(code)
        }
        if (data.isEmpty()) { output(clearCode); output(eoiCode); if (curBits > 0) bytes.add(cur and 0xff); return bytes.toIntArray() }
        output(clearCode)
        var prefix = data[0].toInt() and 0xff
        for (i in 1 until data.size) {
            val k = data[i].toInt() and 0xff
            val key = (prefix shl 8) or k
            val f = dict[key]
            if (f != null) { prefix = f; continue }
            output(prefix)
            if (next < 4096) { dict[key] = next; next++ }
            else { output(clearCode); dict.clear(); next = eoiCode + 1; codeSize = minCodeSize + 1 }
            prefix = k
        }
        output(prefix); output(eoiCode)
        if (curBits > 0) bytes.add(cur and 0xff)
        return bytes.toIntArray()
    }
}
