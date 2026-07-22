package com.glycemicgpt.mobile.data.update

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.glycemicgpt.mobile.BuildConfig
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import timber.log.Timber
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@JsonClass(generateAdapter = true)
data class GitHubRelease(
    @Json(name = "tag_name") val tagName: String,
    val name: String?,
    val assets: List<GitHubAsset>,
    val body: String?,
)

@JsonClass(generateAdapter = true)
data class GitHubAsset(
    val name: String,
    @Json(name = "browser_download_url") val browserDownloadUrl: String,
    val size: Long,
)

data class UpdateInfo(
    val latestVersion: String,
    val latestVersionCode: Int,
    val downloadUrl: String,
    val releaseNotes: String?,
    val apkSizeBytes: Long,
)

sealed class UpdateCheckResult {
    data class UpdateAvailable(val info: UpdateInfo) : UpdateCheckResult()
    object UpToDate : UpdateCheckResult()
    data class Error(val message: String) : UpdateCheckResult()
}

sealed class DownloadResult {
    data class Success(val apkFile: File) : DownloadResult()
    data class Error(val message: String) : DownloadResult()
}

@Singleton
class AppUpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val moshi: Moshi,
) {
    // Standalone client without auth/baseUrl interceptors that would break GitHub API calls
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val apkDir: File
        get() = File(context.cacheDir, APK_SUBDIR).also { it.mkdirs() }

    suspend fun check(currentVersionCode: Int): UpdateCheckResult =
        withContext(Dispatchers.IO) {
            try {
                val channel = BuildConfig.UPDATE_CHANNEL
                val releasesUrl = if (channel == "dev") DEV_RELEASES_URL else STABLE_RELEASES_URL

                val request = Request.Builder()
                    .url(releasesUrl)
                    .header("Accept", "application/vnd.github+json")
                    .build()

                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        val message = if (response.code == 403) {
                            "Rate limit exceeded. Try again later."
                        } else if (response.code == 404 && channel == "dev") {
                            "No dev release available yet."
                        } else {
                            "GitHub API returned ${response.code}"
                        }
                        return@withContext UpdateCheckResult.Error(message)
                    }

                    val body = response.body?.string()
                        ?: return@withContext UpdateCheckResult.Error("Empty response")

                    val adapter = moshi.adapter(GitHubRelease::class.java)
                    val release = adapter.fromJson(body)
                        ?: return@withContext UpdateCheckResult.Error("Failed to parse release")

                    val apkAsset = if (channel == "dev") {
                        selectPhoneApkAsset(release.assets, channel)
                    } else {
                        selectPhoneApkAsset(release.assets, channel, release.tagName.removePrefix("v"))
                    } ?: return@withContext UpdateCheckResult.Error("No APK found in release")

                    if (channel == "dev") {
                        val remoteRunNumber = parseDevRunNumber(apkAsset.name)
                        val localRunNumber = BuildConfig.DEV_BUILD_NUMBER
                        if (remoteRunNumber > localRunNumber) {
                            val version = release.tagName.removePrefix("v")
                                .ifEmpty { "dev" }
                            UpdateCheckResult.UpdateAvailable(
                                UpdateInfo(
                                    latestVersion = version,
                                    latestVersionCode = remoteRunNumber,
                                    downloadUrl = apkAsset.browserDownloadUrl,
                                    releaseNotes = release.body,
                                    apkSizeBytes = apkAsset.size,
                                ),
                            )
                        } else {
                            UpdateCheckResult.UpToDate
                        }
                    } else {
                        val version = release.tagName.removePrefix("v")
                        val remoteVersionCode = parseVersionCode(version)

                        if (remoteVersionCode > currentVersionCode) {
                            UpdateCheckResult.UpdateAvailable(
                                UpdateInfo(
                                    latestVersion = version,
                                    latestVersionCode = remoteVersionCode,
                                    downloadUrl = apkAsset.browserDownloadUrl,
                                    releaseNotes = release.body,
                                    apkSizeBytes = apkAsset.size,
                                ),
                            )
                        } else {
                            UpdateCheckResult.UpToDate
                        }
                    }
                }
            } catch (e: Exception) {
                Timber.w(e, "Update check failed")
                UpdateCheckResult.Error(e.message ?: "Unknown error")
            }
        }

    suspend fun downloadApk(url: String, fileName: String, expectedSize: Long): DownloadResult =
        withContext(Dispatchers.IO) {
            try {
                // An APK download is a code-execution path: enforce https:// in code rather than
                // relying solely on the network_security_config pin (the base config now permits
                // cleartext globally for the LAN opt-in).
                if (!isHttpsUrl(url)) {
                    return@withContext DownloadResult.Error("Download blocked: insecure URL")
                }
                if (!isAllowedDownloadHost(url)) {
                    return@withContext DownloadResult.Error("Download blocked: untrusted host")
                }

                val sanitizedName = sanitizeFileName(fileName)
                cleanOldApks()

                val request = Request.Builder().url(url).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext DownloadResult.Error(
                            "Download failed: HTTP ${response.code}",
                        )
                    }

                    val apkFile = File(apkDir, sanitizedName)
                    response.body?.byteStream()?.use { input ->
                        apkFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    } ?: return@withContext DownloadResult.Error("Empty download body")

                    if (expectedSize > 0 && apkFile.length() != expectedSize) {
                        apkFile.delete()
                        return@withContext DownloadResult.Error(
                            "Download size mismatch (expected ${expectedSize}, got ${apkFile.length()})",
                        )
                    }

                    DownloadResult.Success(apkFile)
                }
            } catch (e: Exception) {
                Timber.w(e, "APK download failed")
                DownloadResult.Error(e.message ?: "Download failed")
            }
        }

    fun createInstallIntent(apkFile: File): Intent {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile,
        )
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun cleanOldApks() {
        apkDir.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { file ->
            file.delete()
        }
    }

    companion object {
        private const val STABLE_RELEASES_URL =
            "https://api.github.com/repos/GlycemicGPT/GlycemicGPT/releases/latest"
        private const val DEV_RELEASES_URL =
            "https://api.github.com/repos/GlycemicGPT/GlycemicGPT/releases/tags/dev-latest"
        private const val APK_SUBDIR = "apk_updates"

        private val ALLOWED_DOWNLOAD_HOSTS = setOf(
            "github.com",
            "objects.githubusercontent.com",
        )

        private val DEV_RUN_NUMBER_REGEX = Regex("""-dev\.(\d+)-""")

        // Anchored to the phone APK's exact release-asset shape so it can never match a Wear or
        // WatchFace asset, regardless of asset order in the GitHub API response. Mirrors the
        // "Rename APKs with version" step in .github/workflows/release.yml
        // (`GlycemicGPT-${VERSION}-release.apk`, VERSION always MAJOR.MINOR.PATCH) and the
        // "Rename dev APKs" step in .github/workflows/dev-pre-release.yml
        // (`GlycemicGPT-${VERSION}-dev.${RUN}-debug.apk`, RUN = github.run_number). A positive
        // anchored match trades tolerance for precision: it never matches a *wrong* APK, but a
        // future filename-format change in those workflows makes it match *no* APK (surfaced as
        // "No APK found in release") rather than silently accepting a near-miss -- update this
        // regex in lockstep with the workflow steps above.
        private val STABLE_PHONE_APK_REGEX = Regex("""^GlycemicGPT-(\d+\.\d+\.\d+)-release\.apk$""")
        private val DEV_PHONE_APK_REGEX = Regex("""^GlycemicGPT-(\d+\.\d+\.\d+)-dev\.\d+-debug\.apk$""")

        fun isAllowedDownloadHost(url: String): Boolean {
            val host = try {
                java.net.URI(url).host?.lowercase()
            } catch (_: Exception) {
                null
            } ?: return false
            return ALLOWED_DOWNLOAD_HOSTS.any { allowed ->
                host == allowed || host.endsWith(".$allowed")
            }
        }

        /**
         * True only for a hierarchical `https://` URL with a host; fail-closed on a malformed URL,
         * any other scheme, or an opaque `https:` URI (e.g. `https:payload`, which has scheme
         * `https` but no host).
         */
        fun isHttpsUrl(url: String): Boolean {
            return try {
                val uri = java.net.URI(url)
                uri.scheme?.lowercase() == "https" && !uri.host.isNullOrEmpty()
            } catch (_: Exception) {
                false
            }
        }

        /**
         * Picks the phone APK out of a release's assets by matching its exact filename shape,
         * never by asset order. GitHub does not guarantee upload order for a release's assets,
         * and the phone APK -- being the largest -- tends to finish uploading LAST, so an
         * order-dependent selector can return the Wear or WatchFace APK instead. Those share the
         * phone app's signing key and applicationId, so installing one over the phone app is a
         * silent in-place replacement rather than an install failure.
         *
         * When [expectedVersion] is given (the stable channel, from `release.tagName`), a
         * shape match whose embedded version doesn't equal it is rejected -- otherwise a stale
         * asset left over from a different release (e.g. `GlycemicGPT-1.2.2-release.apk`
         * attached to a v1.2.3 release) would be installed under the version reported to the
         * user. Fails closed on ambiguity too: if more than one asset matches, null is
         * returned rather than picking one via [List.firstOrNull] order.
         */
        fun selectPhoneApkAsset(
            assets: List<GitHubAsset>,
            channel: String,
            expectedVersion: String? = null,
        ): GitHubAsset? {
            val regex = if (channel == "dev") DEV_PHONE_APK_REGEX else STABLE_PHONE_APK_REGEX
            val matches = assets.filter { asset ->
                val match = regex.find(asset.name) ?: return@filter false
                expectedVersion == null || match.groupValues[1] == expectedVersion
            }
            return matches.singleOrNull()
        }

        fun sanitizeFileName(name: String): String {
            val withoutQuery = name.substringBefore("?").substringBefore("#")
            val cleaned = withoutQuery.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            return cleaned.ifEmpty { "update.apk" }
        }

        fun parseVersionCode(version: String): Int {
            val parts = version.split(".")
            val major = parts.getOrElse(0) { "0" }.toIntOrNull() ?: 0
            val minor = parts.getOrElse(1) { "0" }.toIntOrNull() ?: 0
            val patch = parts.getOrElse(2) { "0" }.toIntOrNull() ?: 0
            return major * 1_000_000 + minor * 10_000 + patch
        }

        /**
         * Extracts the dev run number from a dev APK filename.
         * Pattern: GlycemicGPT-{version}-dev.{runNumber}-debug.apk
         * Returns 0 if the pattern doesn't match.
         */
        fun parseDevRunNumber(fileName: String): Int {
            val match = DEV_RUN_NUMBER_REGEX.find(fileName)
            return match?.groupValues?.get(1)?.toIntOrNull() ?: 0
        }
    }
}
