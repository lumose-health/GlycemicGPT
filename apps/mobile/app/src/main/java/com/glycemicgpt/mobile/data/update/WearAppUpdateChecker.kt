package com.glycemicgpt.mobile.data.update

import android.content.Context
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

/**
 * Checks GitHub Releases for newer wear APKs and downloads them to local cache.
 * Reuses [AppUpdateChecker] companion helper methods for version parsing,
 * host validation, and filename sanitization.
 */
@Singleton
class WearAppUpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val moshi: Moshi,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val apkDir: File
        get() = File(context.cacheDir, WEAR_APK_SUBDIR).also { it.mkdirs() }

    /**
     * Check GitHub Releases for a newer wear APK matching [watchChannel].
     *
     * For "dev" channel: compares [watchDevBuildNumber] against the remote run number.
     * For "stable" channel: compares [watchVersionCode] against the remote version code.
     */
    suspend fun check(
        watchVersionCode: Int,
        watchChannel: String,
        watchDevBuildNumber: Int,
    ): UpdateCheckResult = withContext(Dispatchers.IO) {
        try {
            val releasesUrl = if (watchChannel == "dev") DEV_RELEASES_URL else STABLE_RELEASES_URL

            val request = Request.Builder()
                .url(releasesUrl)
                .header("Accept", "application/vnd.github+json")
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val message = when {
                        response.code == 403 -> "Rate limit exceeded. Try again later."
                        response.code == 404 && watchChannel == "dev" ->
                            "No dev release available yet."
                        else -> "GitHub API returned ${response.code}"
                    }
                    return@withContext UpdateCheckResult.Error(message)
                }

                val body = response.body?.string()
                    ?: return@withContext UpdateCheckResult.Error("Empty response")

                val adapter = moshi.adapter(GitHubRelease::class.java)
                val release = adapter.fromJson(body)
                    ?: return@withContext UpdateCheckResult.Error("Failed to parse release")

                val apkAsset = if (watchChannel == "dev") {
                    selectWearApkAsset(release.assets, watchChannel)
                } else {
                    selectWearApkAsset(release.assets, watchChannel, release.tagName.removePrefix("v"))
                } ?: return@withContext UpdateCheckResult.Error("No wear APK found in release")

                if (watchChannel == "dev") {
                    val remoteRunNumber = AppUpdateChecker.parseDevRunNumber(apkAsset.name)
                    if (remoteRunNumber > watchDevBuildNumber) {
                        val version = release.tagName.removePrefix("v").ifEmpty { "dev" }
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
                    val remoteVersionCode = AppUpdateChecker.parseVersionCode(version)
                    if (remoteVersionCode > watchVersionCode) {
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
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (e: Exception) {
            Timber.w(e, "Wear update check failed")
            UpdateCheckResult.Error(e.message ?: "Unknown error")
        }
    }

    /**
     * Download a wear APK from [url] to the local cache directory.
     * Validates the download host and verifies downloaded size matches [expectedSize].
     */
    suspend fun downloadWearApk(
        url: String,
        fileName: String,
        expectedSize: Long,
    ): DownloadResult = withContext(Dispatchers.IO) {
        try {
            // An APK download is a code-execution path: enforce https:// in code rather than
            // relying solely on the network_security_config pin (the base config now permits
            // cleartext globally for the LAN opt-in).
            if (!AppUpdateChecker.isHttpsUrl(url)) {
                return@withContext DownloadResult.Error("Download blocked: insecure URL")
            }
            if (!AppUpdateChecker.isAllowedDownloadHost(url)) {
                return@withContext DownloadResult.Error("Download blocked: untrusted host")
            }

            val sanitizedName = AppUpdateChecker.sanitizeFileName(fileName)
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
                        val buffer = ByteArray(8192)
                        var totalBytes = 0L
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            totalBytes += bytesRead
                            if (totalBytes > MAX_DOWNLOAD_SIZE_BYTES) {
                                apkFile.delete()
                                return@withContext DownloadResult.Error(
                                    "Download exceeds maximum size of ${MAX_DOWNLOAD_SIZE_BYTES / (1024 * 1024)} MB",
                                )
                            }
                            output.write(buffer, 0, bytesRead)
                        }
                    }
                } ?: return@withContext DownloadResult.Error("Empty download body")

                if (expectedSize > 0 && apkFile.length() != expectedSize) {
                    apkFile.delete()
                    return@withContext DownloadResult.Error(
                        "Download size mismatch (expected $expectedSize, got ${apkFile.length()})",
                    )
                }

                DownloadResult.Success(apkFile)
            }
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (e: Exception) {
            try {
                File(apkDir, AppUpdateChecker.sanitizeFileName(fileName)).delete()
            } catch (_: Exception) { /* ignore cleanup failure */ }
            Timber.w(e, "Wear APK download failed")
            DownloadResult.Error(e.message ?: "Download failed")
        }
    }

    private fun cleanOldApks() {
        apkDir.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { it.delete() }
    }

    companion object {
        // Self-update source: the standalone Android repository, which owns the
        // signed release and `dev-latest` pipelines this app polls. `internal`
        // (not `private`) so WearAppUpdateCheckerTest can assert the target repo.
        internal const val STABLE_RELEASES_URL =
            "https://api.github.com/repos/lumose-health/android-unofficial/releases/latest"
        internal const val DEV_RELEASES_URL =
            "https://api.github.com/repos/lumose-health/android-unofficial/releases/tags/dev-latest"
        private const val WEAR_APK_SUBDIR = "wear_apk_updates"

        // Anchored to the Wear APK's exact release-asset shape for the same reason as the
        // phone selector in [AppUpdateChecker]: a positive anchored match can never pick a
        // phone or WatchFace asset, regardless of asset order in the GitHub API response,
        // and a filename-format change in the release pipeline surfaces as "No wear APK
        // found in release" rather than a silent near-miss install.
        private val STABLE_WEAR_APK_REGEX =
            Regex("""^GlycemicGPT-Wear-(\d+\.\d+\.\d+)-release\.apk$""")
        private val DEV_WEAR_APK_REGEX =
            Regex("""^GlycemicGPT-Wear-(\d+\.\d+\.\d+)-dev\.\d+-debug\.apk$""")

        /**
         * Picks the Wear APK out of a release's assets by matching its exact filename shape,
         * never by asset order. Same contract as [AppUpdateChecker.selectPhoneApkAsset]:
         * when [expectedVersion] is given (the stable channel, from `release.tagName`), a
         * shape match whose embedded version doesn't equal it is rejected, and ambiguity
         * (more than one match) fails closed to null.
         */
        fun selectWearApkAsset(
            assets: List<GitHubAsset>,
            channel: String,
            expectedVersion: String? = null,
        ): GitHubAsset? {
            val regex = if (channel == "dev") DEV_WEAR_APK_REGEX else STABLE_WEAR_APK_REGEX
            val matches = assets.filter { asset ->
                val match = regex.find(asset.name) ?: return@filter false
                expectedVersion == null || match.groupValues[1] == expectedVersion
            }
            return matches.singleOrNull()
        }
        /** Max download size: 100 MB to prevent disk exhaustion */
        private const val MAX_DOWNLOAD_SIZE_BYTES = 100L * 1024 * 1024
    }
}
