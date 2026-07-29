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
class WearAppUpdateCheckerTest {

    // The wear checker self-updates from the standalone Android repository.

    @Test
    fun `wear release URLs target the android-only repository`() {
        assertTrue(WearAppUpdateChecker.STABLE_RELEASES_URL.startsWith("https://api.github.com/"))
        assertTrue(WearAppUpdateChecker.DEV_RELEASES_URL.startsWith("https://api.github.com/"))
        assertTrue(
            WearAppUpdateChecker.STABLE_RELEASES_URL
                .contains("/repos/lumose-health/android-unofficial/"),
        )
        assertTrue(
            WearAppUpdateChecker.DEV_RELEASES_URL
                .contains("/repos/lumose-health/android-unofficial/"),
        )
        // Never regress to a legacy owner/repo slug.
        assertFalse(WearAppUpdateChecker.STABLE_RELEASES_URL.contains("/GlycemicGPT/GlycemicGPT/"))
        assertFalse(WearAppUpdateChecker.DEV_RELEASES_URL.contains("/GlycemicGPT/GlycemicGPT/"))
        assertFalse(
            WearAppUpdateChecker.STABLE_RELEASES_URL
                .contains("/GlycemicGPT/glycemicgpt-android-unofficial/"),
        )
        assertFalse(
            WearAppUpdateChecker.DEV_RELEASES_URL
                .contains("/GlycemicGPT/glycemicgpt-android-unofficial/"),
        )
    }

    @Test
    fun `parseDevRunNumber extracts number from wear APK filename`() {
        val name = "GlycemicGPT-Wear-0.1.99-dev.42-debug.apk"
        assertEquals(42, AppUpdateChecker.parseDevRunNumber(name))
    }

    @Test
    fun `parseDevRunNumber returns 0 for non-matching filename`() {
        val name = "GlycemicGPT-Wear-0.1.99-release.apk"
        assertEquals(0, AppUpdateChecker.parseDevRunNumber(name))
    }

    @Test
    fun `parseVersionCode computes correct code from version string`() {
        assertEquals(1_000_000, AppUpdateChecker.parseVersionCode("1.0.0"))
        assertEquals(10_099, AppUpdateChecker.parseVersionCode("0.1.99"))
        assertEquals(2_030_005, AppUpdateChecker.parseVersionCode("2.3.5"))
    }

    @Test
    fun `isAllowedDownloadHost accepts github domains`() {
        assertTrue(
            AppUpdateChecker.isAllowedDownloadHost(
                "https://github.com/lumose-health/android-unofficial/releases/download/v1.0.0/test.apk",
            ),
        )
        assertTrue(
            AppUpdateChecker.isAllowedDownloadHost(
                "https://objects.githubusercontent.com/path/to/file",
            ),
        )
    }

    @Test
    fun `isAllowedDownloadHost rejects untrusted domains`() {
        assertTrue(
            !AppUpdateChecker.isAllowedDownloadHost("https://evil.com/malware.apk"),
        )
    }

    @Test
    fun `an https URL to an allowed host passes both wear download guards`() {
        val url = "https://github.com/lumose-health/android-unofficial/releases/download/v1.0/wear.apk"
        assertTrue(AppUpdateChecker.isHttpsUrl(url))
        assertTrue(AppUpdateChecker.isAllowedDownloadHost(url))
    }

    @Test
    fun `downloadWearApk rejects an insecure http URL even to an allowed host`() = runTest {
        val checker = WearAppUpdateChecker(mockk(relaxed = true), Moshi.Builder().build())
        val result = checker.downloadWearApk("http://github.com/x/wear.apk", "wear.apk", 0L)
        assertTrue(result is DownloadResult.Error)
        assertEquals("Download blocked: insecure URL", (result as DownloadResult.Error).message)
    }

    @Test
    fun `sanitizeFileName removes special characters`() {
        assertEquals(
            "GlycemicGPT-Wear-0.1.99-dev.42-debug.apk",
            AppUpdateChecker.sanitizeFileName("GlycemicGPT-Wear-0.1.99-dev.42-debug.apk"),
        )
        assertEquals(
            "file_with_spaces_.apk",
            AppUpdateChecker.sanitizeFileName("file with spaces .apk"),
        )
    }

    @Test
    fun `sanitizeFileName strips query and fragment`() {
        assertEquals(
            "test.apk",
            AppUpdateChecker.sanitizeFileName("test.apk?token=abc#section"),
        )
    }

    private fun asset(name: String) = GitHubAsset(
        name = name,
        browserDownloadUrl =
            "https://github.com/lumose-health/android-unofficial/releases/download/v0.14.0/$name",
        size = 1L,
    )

    // selectWearApkAsset tests -- same failure class as the phone selector (GLY-170): a
    // release attaches four assets and GitHub does not guarantee order, so the fixtures put
    // the wrong assets first to catch a selector that trusts asset order.

    @Test
    fun `selectWearApkAsset picks the stable wear APK among all four release assets`() {
        val assets = listOf(
            asset("GlycemicGPT-0.14.0-release.apk"),
            asset("GlycemicGPT-WatchFace-Digital-0.14.0-release.apk"),
            asset("GlycemicGPT-WatchFace-Analog-0.14.0-release.apk"),
            asset("GlycemicGPT-Wear-0.14.0-release.apk"),
        )
        val selected = WearAppUpdateChecker.selectWearApkAsset(assets, channel = "stable")
        assertEquals("GlycemicGPT-Wear-0.14.0-release.apk", selected?.name)
    }

    @Test
    fun `selectWearApkAsset picks the dev wear APK and never the phone dev APK`() {
        val assets = listOf(
            asset("GlycemicGPT-0.14.0-dev.42-debug.apk"),
            asset("GlycemicGPT-Wear-0.14.0-dev.42-debug.apk"),
        )
        val selected = WearAppUpdateChecker.selectWearApkAsset(assets, channel = "dev")
        assertEquals("GlycemicGPT-Wear-0.14.0-dev.42-debug.apk", selected?.name)
    }

    @Test
    fun `selectWearApkAsset does not cross channels`() {
        val stableAssets = listOf(asset("GlycemicGPT-Wear-0.14.0-release.apk"))
        assertNull(WearAppUpdateChecker.selectWearApkAsset(stableAssets, channel = "dev"))

        val devAssets = listOf(asset("GlycemicGPT-Wear-0.14.0-dev.42-debug.apk"))
        assertNull(WearAppUpdateChecker.selectWearApkAsset(devAssets, channel = "stable"))
    }

    @Test
    fun `selectWearApkAsset rejects a stale asset whose version does not match expectedVersion`() {
        val assets = listOf(asset("GlycemicGPT-Wear-0.13.0-release.apk"))
        val selected = WearAppUpdateChecker.selectWearApkAsset(
            assets,
            channel = "stable",
            expectedVersion = "0.14.0",
        )
        assertNull(selected)
    }

    @Test
    fun `selectWearApkAsset fails closed when two wear-shaped assets are both present`() {
        val assets = listOf(
            asset("GlycemicGPT-Wear-0.14.0-release.apk"),
            asset("GlycemicGPT-Wear-0.14.1-release.apk"),
        )
        assertNull(WearAppUpdateChecker.selectWearApkAsset(assets, channel = "stable"))
    }

    @Test
    fun `version comparison dev channel uses run number not version code`() {
        // Dev channel: remote run 50 > local run 42 -> update available
        val remoteRun = AppUpdateChecker.parseDevRunNumber("GlycemicGPT-Wear-0.1.99-dev.50-debug.apk")
        val localRun = 42
        assertTrue(remoteRun > localRun)

        // Dev channel: remote run 42 <= local run 42 -> up to date
        val sameRun = AppUpdateChecker.parseDevRunNumber("GlycemicGPT-Wear-0.1.99-dev.42-debug.apk")
        assertTrue(sameRun <= localRun)
    }

    @Test
    fun `version comparison stable channel uses version code`() {
        val remote = AppUpdateChecker.parseVersionCode("0.2.0")
        val local = AppUpdateChecker.parseVersionCode("0.1.99")
        assertTrue(remote > local)

        val sameVersion = AppUpdateChecker.parseVersionCode("0.1.99")
        assertTrue(sameVersion <= local)
    }
}
