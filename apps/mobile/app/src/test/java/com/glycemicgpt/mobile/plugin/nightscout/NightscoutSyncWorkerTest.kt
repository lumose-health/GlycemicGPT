package com.glycemicgpt.mobile.plugin.nightscout

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Pins the outcome -> WorkManager Result mapping. The load-bearing cases: Transient is the
 * ONLY retrying outcome, and NoBackend (GLY-146) is terminal -- mapping it to retry would
 * re-create the infinite BLE-only retry loop the stand-down exists to prevent.
 */
// Plain Application: the manifest's @HiltAndroidApp class would pull keystore-backed
// injection into a JVM test; the worker gets its engine from an explicit factory instead.
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NightscoutSyncWorkerTest {

    private val engine: NightscoutSyncEngine = mockk()

    private fun buildWorker(): NightscoutSyncWorker {
        val context = ApplicationProvider.getApplicationContext<Context>()
        return TestListenableWorkerBuilder<NightscoutSyncWorker>(context)
            .setWorkerFactory(object : WorkerFactory() {
                override fun createWorker(
                    appContext: Context,
                    workerClassName: String,
                    workerParameters: WorkerParameters,
                ): ListenableWorker = NightscoutSyncWorker(appContext, workerParameters, engine)
            })
            .build()
    }

    private fun assertOutcomeMapsTo(outcome: SyncOutcome, expected: ListenableWorker.Result) = runTest {
        coEvery { engine.syncOnce(any()) } returns outcome
        assertEquals(expected, buildWorker().doWork())
    }

    @Test
    fun `NoBackend is terminal - success, never retry`() {
        assertOutcomeMapsTo(SyncOutcome.NoBackend, ListenableWorker.Result.success())
    }

    @Test
    fun `Transient retries`() {
        assertOutcomeMapsTo(SyncOutcome.Transient, ListenableWorker.Result.retry())
    }

    @Test
    fun `Disabled and AuthError end the run without retrying`() {
        assertOutcomeMapsTo(SyncOutcome.Disabled, ListenableWorker.Result.success())
        assertOutcomeMapsTo(SyncOutcome.AuthError, ListenableWorker.Result.success())
    }

    @Test
    fun `an engine crash retries instead of failing the chain`() = runTest {
        coEvery { engine.syncOnce(any()) } throws IllegalStateException("boom")
        assertEquals(ListenableWorker.Result.retry(), buildWorker().doWork())
    }
}
