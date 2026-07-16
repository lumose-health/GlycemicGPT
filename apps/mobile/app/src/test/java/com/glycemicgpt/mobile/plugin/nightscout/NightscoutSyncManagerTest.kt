package com.glycemicgpt.mobile.plugin.nightscout

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Pins the BLE-only stand-down (GLY-146) against a real (test-initialized) WorkManager:
 * with no backend configured, neither enable() nor syncNow() may leave any Nightscout
 * work scheduled -- the cloud-mediated sync would only ever be refused by the request
 * layer and retried forever. A schedule left over from a full-stack life is cancelled,
 * and full-stack behavior (schedule periodic + one-shot) stays intact.
 */
// Plain Application: the manifest's @HiltAndroidApp class would pull keystore-backed
// injection into a JVM test that only needs a Context for WorkManager.
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NightscoutSyncManagerTest {

    private lateinit var context: Context
    private lateinit var workManager: WorkManager
    private lateinit var store: NightscoutSyncStore
    private lateinit var authTokenStore: AuthTokenStore
    private lateinit var manager: NightscoutSyncManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        workManager = WorkManager.getInstance(context)
        store = NightscoutSyncStore(FakePluginSettingsStore())
        authTokenStore = mockk {
            every { isBackendConfigured() } returns true
        }
        manager = NightscoutSyncManager(context, store, authTokenStore)
    }

    private fun workInfos(uniqueName: String): List<WorkInfo> =
        workManager.getWorkInfosForUniqueWork(uniqueName).get()

    private fun activeWorkCount(uniqueName: String): Int =
        workInfos(uniqueName).count { !it.state.isFinished }

    @Test
    fun `enable with a backend schedules periodic and one-shot work`() {
        manager.enable()

        assertTrue(store.enabled)
        assertEquals(1, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))
        assertEquals(1, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))
    }

    @Test
    fun `enable without a backend keeps the flag but schedules nothing`() {
        every { authTokenStore.isBackendConfigured() } returns false

        manager.enable()

        // The activation intent persists (sync resumes when a backend appears and the
        // plugin is restored), but no work may exist for it to retry against nothing.
        assertTrue(store.enabled)
        assertEquals(0, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))
        assertEquals(0, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))
    }

    @Test
    fun `enable without a backend cancels a schedule left over from a full-stack life`() {
        manager.enable()
        assertEquals(1, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))

        every { authTokenStore.isBackendConfigured() } returns false
        manager.enable()

        assertEquals(0, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))
        assertEquals(0, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))
    }

    @Test
    fun `syncNow without a backend schedules nothing and cancels stale work`() {
        manager.enable()
        assertEquals(1, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))

        every { authTokenStore.isBackendConfigured() } returns false
        manager.syncNow()

        assertEquals(0, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))
        assertEquals(0, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))
    }

    @Test
    fun `syncNow with a backend schedules the one-shot`() {
        manager.syncNow()

        assertEquals(1, activeWorkCount(NightscoutSyncManager.ONESHOT_WORK))
    }

    @Test
    fun `disable clears the flag and cancels the periodic schedule`() {
        manager.enable()

        manager.disable()

        assertTrue(!store.enabled)
        assertEquals(0, activeWorkCount(NightscoutSyncManager.PERIODIC_WORK))
    }
}
