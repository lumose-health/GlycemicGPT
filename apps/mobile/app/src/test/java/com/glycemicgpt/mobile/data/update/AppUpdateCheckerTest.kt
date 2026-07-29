package com.glycemicgpt.mobile.data.update

import com.squareup.moshi.Moshi
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppUpdateCheckerTest {

    // Self-update targets the standalone Android repository, not the monorepo.

    @Test
    fun `release URLs target the android-only repository`() {
        assertTrue(AppUpdateChecker.STABLE_RELEASES_URL.startsWith("https://api.github.com/"))
        assertTrue(AppUpdateChecker.DEV_RELEASES_URL.startsWith("https://api.github.com/"))
        assertTrue(
            AppUpdateChecker.STABLE_RELEASES_URL
                .contains("/repos/lumose-health/android-unofficial/"),
        )
        assertTrue(
            AppUpdateChecker.DEV_RELEASES_URL
                .contains("/repos/lumose-health/android-unofficial/"),
        )
        // Never regress to a legacy owner/repo slug.
        assertFalse(AppUpdateChecker.STABLE_RELEASES_URL.contains("/GlycemicGPT/GlycemicGPT/"))
        assertFalse(AppUpdateChecker.DEV_RELEASES_URL.contains("/GlycemicGPT/GlycemicGPT/"))
        assertFalse(
            AppUpdateChecker.STABLE_RELEASES_URL
                .contains("/GlycemicGPT/glycemicgpt-android-unofficial/"),
        )
        assertFalse(
            AppUpdateChecker.DEV_RELEASES_URL
                .contains("/GlycemicGPT/glycemicgpt-android-unofficial/"),
        )
    }

    @Test
    fun `parseVersionCode for simple version`() {
        assertEquals(1_000_000, AppUpdateChecker.parseVersionCode("1.0.0"))
    }

    @Test
    fun `parseVersionCode for patch version`() {
        assertEquals(1_000_003, AppUpdateChecker.parseVersionCode("1.0.3"))
    }

    @Test
    fun `parseVersionCode for minor version`() {
        assertEquals(1_020_000, AppUpdateChecker.parseVersionCode("1.2.0"))
    }

    @Test
    fun `parseVersionCode for complex version`() {
        assertEquals(2_050_079, AppUpdateChecker.parseVersionCode("2.5.79"))
    }

    @Test
    fun `parseVersionCode newer is greater`() {
        val old = AppUpdateChecker.parseVersionCode("0.1.79")
        val newer = AppUpdateChecker.parseVersionCode("0.1.80")
        assertTrue(newer > old)
    }

    @Test
    fun `parseVersionCode major bump is greater than minor`() {
        val minorBump = AppUpdateChecker.parseVersionCode("0.99.99")
        val majorBump = AppUpdateChecker.parseVersionCode("1.0.0")
        assertTrue(majorBump > minorBump)
    }

    @Test
    fun `parseVersionCode handles two-part version`() {
        assertEquals(1_020_000, AppUpdateChecker.parseVersionCode("1.2"))
    }

    @Test
    fun `parseVersionCode handles single-part version`() {
        assertEquals(3_000_000, AppUpdateChecker.parseVersionCode("3"))
    }

    // isAllowedDownloadHost tests

    @Test
    fun `isAllowedDownloadHost allows github dot com`() {
        assertTrue(AppUpdateChecker.isAllowedDownloadHost("https://github.com/releases/download/v1.0/app.apk"))
    }

    @Test
    fun `isAllowedDownloadHost allows objects dot githubusercontent`() {
        assertTrue(AppUpdateChecker.isAllowedDownloadHost("https://objects.githubusercontent.com/some-path/app.apk"))
    }

    @Test
    fun `isAllowedDownloadHost blocks arbitrary host`() {
        assertFalse(AppUpdateChecker.isAllowedDownloadHost("https://evil.com/malware.apk"))
    }

    @Test
    fun `isAllowedDownloadHost blocks subdomain spoofing`() {
        assertFalse(AppUpdateChecker.isAllowedDownloadHost("https://evil-github.com/app.apk"))
    }

    @Test
    fun `isAllowedDownloadHost rejects malformed URL`() {
        assertFalse(AppUpdateChecker.isAllowedDownloadHost("not-a-url"))
    }

    // isHttpsUrl tests (APK downloads must be https:// -- a code-execution path)

    @Test
    fun `isHttpsUrl accepts https`() {
        assertTrue(AppUpdateChecker.isHttpsUrl("https://github.com/releases/download/v1.0/app.apk"))
    }

    @Test
    fun `isHttpsUrl rejects http`() {
        assertFalse(AppUpdateChecker.isHttpsUrl("http://github.com/releases/download/v1.0/app.apk"))
    }

    @Test
    fun `isHttpsUrl rejects malformed URL`() {
        assertFalse(AppUpdateChecker.isHttpsUrl("not-a-url"))
    }

    @Test
    fun `isHttpsUrl rejects an opaque https URI without a host`() {
        // "https:payload" is an opaque URI: scheme is https but there is no host.
        assertFalse(AppUpdateChecker.isHttpsUrl("https:payload"))
        assertFalse(AppUpdateChecker.isHttpsUrl("https:///no-host"))
    }

    @Test
    fun `an https URL to an allowed host passes both download guards`() {
        val url = "https://github.com/lumose-health/android-unofficial/releases/download/v1.0/app.apk"
        assertTrue(AppUpdateChecker.isHttpsUrl(url))
        assertTrue(AppUpdateChecker.isAllowedDownloadHost(url))
    }

    @Test
    fun `downloadApk rejects an insecure http URL even to an allowed host`() = runTest {
        val checker = AppUpdateChecker(mockk(relaxed = true), Moshi.Builder().build())
        // http:// fails the scheme guard before any host check or network access.
        val result = checker.downloadApk("http://github.com/x/app.apk", "app.apk", 0L)
        assertTrue(result is DownloadResult.Error)
        assertEquals("Download blocked: insecure URL", (result as DownloadResult.Error).message)
    }

    // sanitizeFileName tests

    @Test
    fun `sanitizeFileName strips query string`() {
        assertEquals("app.apk", AppUpdateChecker.sanitizeFileName("app.apk?token=abc"))
    }

    @Test
    fun `sanitizeFileName strips fragment`() {
        assertEquals("app.apk", AppUpdateChecker.sanitizeFileName("app.apk#section"))
    }

    @Test
    fun `sanitizeFileName replaces special characters`() {
        assertEquals("app__release.apk", AppUpdateChecker.sanitizeFileName("app/ release.apk"))
    }

    @Test
    fun `sanitizeFileName returns fallback for empty input`() {
        assertEquals("update.apk", AppUpdateChecker.sanitizeFileName(""))
    }

    @Test
    fun `sanitizeFileName preserves valid name`() {
        assertEquals("GlycemicGPT-0.1.81-release.apk", AppUpdateChecker.sanitizeFileName("GlycemicGPT-0.1.81-release.apk"))
    }

    // parseDevRunNumber tests

    @Test
    fun `parseDevRunNumber extracts run number from dev APK name`() {
        assertEquals(42, AppUpdateChecker.parseDevRunNumber("GlycemicGPT-0.1.95-dev.42-debug.apk"))
    }

    @Test
    fun `parseDevRunNumber extracts large run number`() {
        assertEquals(1234, AppUpdateChecker.parseDevRunNumber("GlycemicGPT-0.2.0-dev.1234-debug.apk"))
    }

    @Test
    fun `parseDevRunNumber returns 0 for stable APK name`() {
        assertEquals(0, AppUpdateChecker.parseDevRunNumber("GlycemicGPT-0.1.95-release.apk"))
    }

    @Test
    fun `parseDevRunNumber returns 0 for non-matching string`() {
        assertEquals(0, AppUpdateChecker.parseDevRunNumber("base.apk"))
    }

    @Test
    fun `parseDevRunNumber returns 0 for empty string`() {
        assertEquals(0, AppUpdateChecker.parseDevRunNumber(""))
    }

    @Test
    fun `parseDevRunNumber newer run number is greater`() {
        val older = AppUpdateChecker.parseDevRunNumber("GlycemicGPT-0.1.95-dev.10-debug.apk")
        val newer = AppUpdateChecker.parseDevRunNumber("GlycemicGPT-0.1.95-dev.11-debug.apk")
        assertTrue(newer > older)
    }

    @Test
    fun `parseDevRunNumber rejects loose match without hyphens`() {
        assertEquals(0, AppUpdateChecker.parseDevRunNumber("some-devtools.5thing.apk"))
    }

    // selectPhoneApkAsset tests -- GLY-170: a stable release attaches four assets (phone, Wear,
    // WatchFace Digital, WatchFace Analog) and GitHub does not guarantee upload order. The phone
    // APK is the largest and tends to finish uploading LAST, so these fixtures deliberately put
    // Wear/WatchFace FIRST to reproduce the real failure -- a phone-first-only fixture would not
    // catch a selector that just trusts asset order.

    private fun asset(name: String) = GitHubAsset(name, "https://github.com/example/$name", 1_000L)

    @Test
    fun `selectPhoneApkAsset picks the stable phone APK when Wear is listed first`() {
        val assets = listOf(
            asset("GlycemicGPT-Wear-1.2.3-release.apk"),
            asset("GlycemicGPT-WatchFace-Digital-1.2.3-release.apk"),
            asset("GlycemicGPT-WatchFace-Analog-1.2.3-release.apk"),
            asset("GlycemicGPT-1.2.3-release.apk"),
        )
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable")
        assertEquals("GlycemicGPT-1.2.3-release.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset picks the dev phone APK when Wear is listed first`() {
        val assets = listOf(
            asset("GlycemicGPT-Wear-1.2.3-dev.42-debug.apk"),
            asset("GlycemicGPT-1.2.3-dev.42-debug.apk"),
        )
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "dev")
        assertEquals("GlycemicGPT-1.2.3-dev.42-debug.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset picks the stable phone APK when it is already first`() {
        val assets = listOf(
            asset("GlycemicGPT-1.2.3-release.apk"),
            asset("GlycemicGPT-Wear-1.2.3-release.apk"),
        )
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable")
        assertEquals("GlycemicGPT-1.2.3-release.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset never returns a Wear or WatchFace asset for the stable channel`() {
        val assets = listOf(
            asset("GlycemicGPT-Wear-1.2.3-release.apk"),
            asset("GlycemicGPT-WatchFace-Digital-1.2.3-release.apk"),
            asset("GlycemicGPT-WatchFace-Analog-1.2.3-release.apk"),
        )
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable")
        assertNull(selected)
    }

    @Test
    fun `selectPhoneApkAsset never returns a Wear or WatchFace asset for the dev channel`() {
        val assets = listOf(
            asset("GlycemicGPT-Wear-1.2.3-dev.42-debug.apk"),
            asset("GlycemicGPT-WatchFace-Digital-1.2.3-dev.42-debug.apk"),
            asset("GlycemicGPT-WatchFace-Analog-1.2.3-dev.42-debug.apk"),
        )
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "dev")
        assertNull(selected)
    }

    @Test
    fun `selectPhoneApkAsset does not cross channels`() {
        val assets = listOf(asset("GlycemicGPT-1.2.3-release.apk"))
        assertNull(AppUpdateChecker.selectPhoneApkAsset(assets, channel = "dev"))

        val devAssets = listOf(asset("GlycemicGPT-1.2.3-dev.42-debug.apk"))
        assertNull(AppUpdateChecker.selectPhoneApkAsset(devAssets, channel = "stable"))
    }

    @Test
    fun `selectPhoneApkAsset ignores an unrelated asset name`() {
        // GitHub auto-attaches "Source code (zip)"/(tar.gz) to every release; neither of those,
        // nor any other unrelated artifact, should ever satisfy the phone-APK shape.
        val assets = listOf(
            asset("SomeOtherApp-1.2.3-release.apk"),
            asset("v1.2.3.zip"),
            asset("GlycemicGPT-1.2.3-release.apk.sha256"),
        )
        assertNull(AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable"))
    }

    @Test
    fun `selectPhoneApkAsset handles multi-digit version segments`() {
        val assets = listOf(asset("GlycemicGPT-10.20.130-release.apk"))
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable")
        assertEquals("GlycemicGPT-10.20.130-release.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset returns null for an empty asset list`() {
        assertNull(AppUpdateChecker.selectPhoneApkAsset(emptyList(), channel = "stable"))
    }

    // expectedVersion pinning tests -- a release's assets should never be trusted purely by
    // filename shape when a stronger source of truth (the release's own tag) is available; a
    // stale asset left over from a different release must not be installed under the wrong
    // reported version.

    @Test
    fun `selectPhoneApkAsset accepts a phone APK whose version matches expectedVersion`() {
        val assets = listOf(asset("GlycemicGPT-1.2.3-release.apk"))
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable", expectedVersion = "1.2.3")
        assertEquals("GlycemicGPT-1.2.3-release.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset rejects a stale asset whose version does not match expectedVersion`() {
        // A v1.2.3 release carrying a leftover GlycemicGPT-1.2.2-release.apk asset must not be
        // installed and reported to the user as version 1.2.3.
        val assets = listOf(asset("GlycemicGPT-1.2.2-release.apk"))
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable", expectedVersion = "1.2.3")
        assertNull(selected)
    }

    @Test
    fun `selectPhoneApkAsset ignores expectedVersion when null`() {
        val assets = listOf(asset("GlycemicGPT-1.2.3-release.apk"))
        val selected = AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable", expectedVersion = null)
        assertEquals("GlycemicGPT-1.2.3-release.apk", selected?.name)
    }

    @Test
    fun `selectPhoneApkAsset fails closed when two phone-shaped assets are both present`() {
        // Should never happen for a well-formed release, but the selector must not silently
        // pick one via firstOrNull order if it does.
        val assets = listOf(
            asset("GlycemicGPT-1.2.3-release.apk"),
            asset("GlycemicGPT-1.2.4-release.apk"),
        )
        assertNull(AppUpdateChecker.selectPhoneApkAsset(assets, channel = "stable"))
    }
}
