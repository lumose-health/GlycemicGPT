package com.glycemicgpt.mobile.data.repository

import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.dao.SyncDao
import com.glycemicgpt.mobile.data.local.entity.SyncQueueEntity
import com.glycemicgpt.mobile.data.remote.InstantAdapter
import com.glycemicgpt.mobile.domain.model.BasalReading
import com.glycemicgpt.mobile.domain.model.BatteryStatus
import com.glycemicgpt.mobile.domain.model.BolusEvent
import com.glycemicgpt.mobile.domain.model.PumpActivityMode
import com.glycemicgpt.mobile.domain.model.IoBReading
import com.glycemicgpt.mobile.domain.model.ReservoirReading
import com.squareup.moshi.Moshi
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class SyncQueueEnqueuerTest {

    private val syncDao = mockk<SyncDao>(relaxed = true)
    private val authTokenStore = mockk<AuthTokenStore> {
        every { isBackendConfigured() } returns true
    }
    private val moshi = Moshi.Builder().add(InstantAdapter()).build()
    private val enqueuer = SyncQueueEnqueuer(syncDao, authTokenStore, moshi)

    @Test
    fun `enqueueIoB creates entity with bg_reading type`() = runTest {
        val slot = slot<List<SyncQueueEntity>>()
        coEvery { syncDao.enqueueAll(capture(slot)) } returns Unit

        val now = Instant.now()
        enqueuer.enqueueIoB(IoBReading(iob = 2.5f, timestamp = now))

        val entity = slot.captured.single()
        assertEquals("bg_reading", entity.eventType)
        assertEquals(now.toEpochMilli(), entity.eventTimestampMs)
        assertTrue(entity.payload.contains("2.5"))
        assertEquals(SyncQueueEntity.STATUS_PENDING, entity.status)
    }

    @Test
    fun `enqueueBasal creates entity with basal type`() = runTest {
        val slot = slot<List<SyncQueueEntity>>()
        coEvery { syncDao.enqueueAll(capture(slot)) } returns Unit

        enqueuer.enqueueBasal(
            BasalReading(
                rate = 1.2f,
                isAutomated = true,
                activityMode = PumpActivityMode.EXERCISE,
                timestamp = Instant.now(),
            ),
        )

        val entity = slot.captured.single()
        assertEquals("basal", entity.eventType)
        assertTrue(entity.payload.contains("exercise"))
    }

    @Test
    fun `enqueueBoluses enqueues one entity per event`() = runTest {
        val events = listOf(
            BolusEvent(units = 3.0f, isAutomated = false, isCorrection = false, timestamp = Instant.now()),
            BolusEvent(units = 1.5f, isAutomated = true, isCorrection = true, timestamp = Instant.now()),
        )

        val slot = slot<List<SyncQueueEntity>>()
        coEvery { syncDao.enqueueAll(capture(slot)) } returns Unit

        enqueuer.enqueueBoluses(events)

        assertEquals(2, slot.captured.size)
    }

    @Test
    fun `enqueue is a no-op for every event type when no backend is configured`() = runTest {
        every { authTokenStore.isBackendConfigured() } returns false

        enqueuer.enqueueIoB(IoBReading(iob = 2.5f, timestamp = Instant.now()))
        enqueuer.enqueueBasal(
            BasalReading(
                rate = 1.2f,
                isAutomated = true,
                activityMode = PumpActivityMode.NONE,
                timestamp = Instant.now(),
            ),
        )
        enqueuer.enqueueBasalBatch(
            listOf(
                BasalReading(
                    rate = 0.5f,
                    isAutomated = false,
                    activityMode = PumpActivityMode.NONE,
                    timestamp = Instant.now(),
                ),
            ),
        )
        enqueuer.enqueueBoluses(
            listOf(BolusEvent(units = 3.0f, isAutomated = false, isCorrection = false, timestamp = Instant.now())),
        )
        enqueuer.enqueueBattery(BatteryStatus(percentage = 80, isCharging = false, timestamp = Instant.now()))
        enqueuer.enqueueReservoir(ReservoirReading(unitsRemaining = 150f, timestamp = Instant.now()))

        coVerify(exactly = 0) { syncDao.enqueueAll(any()) }
    }

    @Test
    fun `enqueue swallows storage failures instead of crashing the caller`() = runTest {
        // The polling loops upstream have no catch of their own -- an enqueue failure
        // (keystore flake, disk full) must not propagate and kill pump polling.
        coEvery { syncDao.enqueueAll(any()) } throws RuntimeException("disk full")

        enqueuer.enqueueIoB(IoBReading(iob = 2.5f, timestamp = Instant.now()))
    }

    @Test
    fun `enqueue inserts again once a backend is configured`() = runTest {
        every { authTokenStore.isBackendConfigured() } returns false
        enqueuer.enqueueIoB(IoBReading(iob = 1.0f, timestamp = Instant.now()))
        coVerify(exactly = 0) { syncDao.enqueueAll(any()) }

        every { authTokenStore.isBackendConfigured() } returns true
        enqueuer.enqueueIoB(IoBReading(iob = 1.0f, timestamp = Instant.now()))
        coVerify(exactly = 1) { syncDao.enqueueAll(any()) }
    }
}
