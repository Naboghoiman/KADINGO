package com.example

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.example.security.EntitlementManager
import com.example.security.EntitlementState
import com.example.ui.SubscriptionGateScreen
import com.example.ui.TrialBanner
import com.example.ui.theme.MyApplicationTheme
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    companion object {
        private const val HOST = "appassets.androidplatform.net"
    }

    private lateinit var entitlementManager: EntitlementManager
    private var webView: WebView? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var stateDb: SQLiteOpenHelper
    private val dbExecutor = Executors.newSingleThreadExecutor()

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            notifyMusicChanged()
        } else {
            Toast.makeText(this, "Music permission denied", Toast.LENGTH_SHORT).show()
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = mutableListOf<Uri>()
        val data = result.data
        if (data != null) {
            val clipData = data.clipData
            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    val uri = clipData.getItemAt(i).uri
                    takePersistablePermission(uri)
                    uris.add(uri)
                }
            } else {
                data.data?.let { uri ->
                    takePersistablePermission(uri)
                    uris.add(uri)
                }
            }
        }
        fileCallback?.onReceiveValue(if (uris.isNotEmpty()) uris.toTypedArray() else null)
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        entitlementManager = EntitlementManager(this)

        stateDb = object : SQLiteOpenHelper(this, "bugobi_dj_state.db", null, 1) {
            override fun onCreate(db: SQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS track_state (track_key TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)"
                )
            }
            override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}
        }

        setContent {
            MyApplicationTheme {
                val entitlementState by entitlementManager.state.collectAsState()
                var showLicenseModal by remember { mutableStateOf(false) }

                when (val current = entitlementState) {
                    is EntitlementState.Locked -> {
                        // Secure gate: DJ WebView runtime is completely prevented from initializing
                        SubscriptionGateScreen(
                            lockReason = current.reason,
                            deviceId = entitlementManager.deviceId,
                            onSubscribe = {
                                entitlementManager.purchaseSubscription()
                                Toast.makeText(this, "DJ IMAN Pro Subscription Activated!", Toast.LENGTH_LONG).show()
                            },
                            onRestore = {
                                val success = entitlementManager.restorePurchases()
                                Toast.makeText(
                                    this,
                                    if (success) "Subscription restored!" else "No active subscriptions found for this account",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onTransfer = {
                                val success = entitlementManager.transferDevice()
                                Toast.makeText(
                                    this,
                                    if (success) "Device transferred successfully!" else "No subscription found to transfer",
                                    Toast.LENGTH_SHORT
                                ).show()
                            },
                            onReviewerCodeSubmitted = { code ->
                                val success = entitlementManager.activateReviewerCode(code)
                                if (success) {
                                    Toast.makeText(this, "Play Console Reviewer Access Granted", Toast.LENGTH_SHORT).show()
                                }
                                success
                            }
                        )
                    }
                    is EntitlementState.TrialActive,
                    is EntitlementState.Subscribed,
                    is EntitlementState.ReviewerActive -> {
                        Box(modifier = Modifier.fillMaxSize()) {
                            Column(modifier = Modifier.fillMaxSize()) {
                                TrialBanner(
                                    state = current,
                                    onManageClicked = { showLicenseModal = true },
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                    DJWebViewHost()
                                }
                            }

                            if (showLicenseModal) {
                                SubscriptionGateScreen(
                                    lockReason = "DJ IMAN License & Hardware Authorization",
                                    deviceId = entitlementManager.deviceId,
                                    onSubscribe = {
                                        entitlementManager.purchaseSubscription()
                                        showLicenseModal = false
                                        Toast.makeText(this@MainActivity, "Pro Subscription Updated", Toast.LENGTH_SHORT).show()
                                    },
                                    onRestore = {
                                        entitlementManager.restorePurchases()
                                        showLicenseModal = false
                                    },
                                    onTransfer = {
                                        entitlementManager.transferDevice()
                                        showLicenseModal = false
                                        Toast.makeText(this@MainActivity, "License bound to this device", Toast.LENGTH_SHORT).show()
                                    },
                                    onReviewerCodeSubmitted = { code ->
                                        val success = entitlementManager.activateReviewerCode(code)
                                        if (success) showLicenseModal = false
                                        success
                                    }
                                )
                            }
                        }
                    }
                    is EntitlementState.Loading -> {
                        Box(modifier = Modifier.fillMaxSize())
                    }
                }
            }
        }
    }

    @Composable
    private fun DJWebViewHost() {
        BackHandler {
            webView?.evaluateJavascript("window.dispatchEvent(new Event('android-back'))", null)
        }

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                createAndConfigureWebView(context)
            },
            update = { view ->
                webView = view
            }
        )
    }

    private fun createAndConfigureWebView(context: android.content.Context): WebView {
        val wv = WebView(context).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                setSupportMultipleWindows(false)
                mediaPlaybackRequiresUserGesture = false
                builtInZoomControls = false
                displayZoomControls = false
                textZoom = 100
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }

            addJavascriptInterface(HostBridge(), "AndroidHost")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val uri = request?.url ?: return null
                    if ("https" != uri.scheme || HOST != uri.host) {
                        return null
                    }

                    val path = uri.path ?: "/index.html"
                    val normalizedPath = if (path.isEmpty() || path == "/") "/index.html" else path

                    return try {
                        when {
                            normalizedPath.startsWith("/api/music") -> handleMusicApi(uri)
                            normalizedPath.startsWith("/media/audio") -> handleMediaAudio(uri)
                            normalizedPath.startsWith("/api/state") -> handleStateApi(uri)
                            normalizedPath.startsWith("/license/") -> createJsonResponse(404, "{\"error\":\"Not Found\"}")
                            else -> loadAsset(normalizedPath.removePrefix("/"))
                        }
                    } catch (t: Throwable) {
                        createJsonResponse(500, "{\"error\":\"${t.message ?: "Error"}\"}")
                    }
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return true
                    return !("https" == uri.scheme && HOST == uri.host)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    w: WebView?,
                    callback: ValueCallback<Array<Uri>>?,
                    params: FileChooserParams?
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    return try {
                        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "audio/*"
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                        filePickerLauncher.launch(intent)
                        true
                    } catch (e: ActivityNotFoundException) {
                        fileCallback = null
                        Toast.makeText(this@MainActivity, "No audio picker found", Toast.LENGTH_SHORT).show()
                        false
                    }
                }
            }

            loadUrl("https://appassets.androidplatform.net/index.html")
        }
        webView = wv
        return wv
    }

    private fun takePersistablePermission(uri: Uri) {
        try {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) {}
    }

    private fun loadAsset(path: String): WebResourceResponse {
        val stream: InputStream = assets.open("www/$path")
        val mime = when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") -> "text/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".wasm") -> "application/wasm"
            else -> "application/octet-stream"
        }
        val headers = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to "no-cache"
        )
        return WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
    }

    private fun createJsonResponse(status: Int, body: String): WebResourceResponse {
        val headers = mapOf(
            "Content-Type" to "application/json",
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to "no-cache, no-store"
        )
        return WebResourceResponse(
            "application/json",
            "UTF-8",
            status,
            if (status >= 400) "Error" else "OK",
            headers,
            ByteArrayInputStream(body.toByteArray(StandardCharsets.UTF_8))
        )
    }

    private fun requiredAudioPermission(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    private fun handleMusicApi(uri: Uri): WebResourceResponse {
        val perm = requiredAudioPermission()
        val hasPermission = checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) {
            return createJsonResponse(200, "{\"permission\":false,\"tracks\":[],\"more\":false}")
        }

        return try {
            val query = uri.getQueryParameter("q") ?: ""
            val offset = uri.getQueryParameter("offset")?.toIntOrNull() ?: 0
            val limit = 60

            val tracks = JSONArray()
            val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.SIZE
            )

            var selection = "${MediaStore.Audio.Media.DURATION} > 0 AND ${MediaStore.Audio.Media.SIZE} > 0"
            var selectionArgs: Array<String>? = null
            if (query.isNotBlank()) {
                selection += " AND (${MediaStore.Audio.Media.TITLE} LIKE ? OR ${MediaStore.Audio.Media.ARTIST} LIKE ?)"
                selectionArgs = arrayOf("%$query%", "%$query%")
            }

            val sortOrder = "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC, ${MediaStore.Audio.Media._ID} ASC"

            contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val modCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)

                if (cursor.moveToPosition(offset)) {
                    var count = 0
                    do {
                        val id = cursor.getLong(idCol)
                        val trackUri = ContentUris.withAppendedId(collection, id)
                        val t = JSONObject().apply {
                            put("id", id.toString())
                            put("mediaId", id)
                            put("title", cursor.getString(titleCol) ?: "Unknown Track")
                            put("artist", cursor.getString(artistCol) ?: "Unknown Artist")
                            put("duration", cursor.getLong(durCol) / 1000L)
                            put("modified", cursor.getLong(modCol))
                            put("size", cursor.getLong(sizeCol))
                            put("uri", trackUri.toString())
                        }
                        tracks.put(t)
                        count++
                    } while (count < limit && cursor.moveToNext())
                }
            }

            val root = JSONObject().apply {
                put("permission", true)
                put("tracks", tracks)
                put("more", tracks.length() == limit)
            }
            createJsonResponse(200, root.toString())
        } catch (t: Throwable) {
            createJsonResponse(500, "{\"error\":\"${t.message}\"}")
        }
    }

    private fun handleMediaAudio(uri: Uri): WebResourceResponse {
        val audioUriStr = uri.getQueryParameter("uri")
            ?: return createJsonResponse(400, "{\"error\":\"Missing uri parameter\"}")
        val targetUri = Uri.parse(audioUriStr)

        return try {
            val pfd = contentResolver.openAssetFileDescriptor(targetUri, "r")
                ?: return createJsonResponse(404, "{\"error\":\"File not found\"}")
            val inputStream = pfd.createInputStream()
            val headers = mapOf(
                "Accept-Ranges" to "bytes",
                "Access-Control-Allow-Origin" to "*",
                "Content-Length" to pfd.length.toString()
            )
            WebResourceResponse("audio/mpeg", "UTF-8", 200, "OK", headers, inputStream)
        } catch (t: Throwable) {
            createJsonResponse(404, "{\"error\":\"Cannot open audio stream\"}")
        }
    }

    private fun handleStateApi(uri: Uri): WebResourceResponse {
        val key = uri.getQueryParameter("key")
            ?: return createJsonResponse(400, "{\"error\":\"Missing key\"}")

        return try {
            val db = stateDb.readableDatabase
            db.query(
                "track_state",
                arrayOf("state_json"),
                "track_key = ?",
                arrayOf(key),
                null,
                null,
                null
            ).use { cursor ->
                if (cursor.moveToFirst()) {
                    val json = cursor.getString(0)
                    createJsonResponse(200, json)
                } else {
                    createJsonResponse(404, "{\"error\":\"Not Found\"}")
                }
            }
        } catch (t: Throwable) {
            createJsonResponse(500, "{\"error\":\"State DB error\"}")
        }
    }

    private fun notifyMusicChanged() {
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new Event('phone-music-changed'))",
                null
            )
        }
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        dbExecutor.shutdown()
        stateDb.close()
        super.onDestroy()
    }

    inner class HostBridge {
        @JavascriptInterface
        fun orientation(value: String) {
            runOnUiThread {
                requestedOrientation = if ("landscape" == value) {
                    ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
            }
        }

        @JavascriptInterface
        fun closeApp() {
            runOnUiThread { finish() }
        }

        @JavascriptInterface
        fun requestAudioPermission() {
            runOnUiThread {
                val perm = requiredAudioPermission()
                if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
                    audioPermissionLauncher.launch(perm)
                } else {
                    notifyMusicChanged()
                }
            }
        }

        @JavascriptInterface
        fun saveTrackState(trackKey: String, stateJson: String) {
            dbExecutor.execute {
                try {
                    val db = stateDb.writableDatabase
                    val values = ContentValues().apply {
                        put("track_key", trackKey)
                        put("state_json", stateJson)
                        put("updated_at", System.currentTimeMillis())
                    }
                    db.insertWithOnConflict("track_state", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                    db.execSQL(
                        "DELETE FROM track_state WHERE track_key NOT IN (SELECT track_key FROM track_state ORDER BY updated_at DESC LIMIT 64)"
                    )
                } catch (_: Exception) {}
            }
        }
    }
}
