package com.glycemicgpt.mobile.data.repository

import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.dao.SyncDao
import com.glycemicgpt.mobile.data.local.entity.SyncQueueEntity
import com.glycemicgpt.mobile.data.remote.PumpEventMapper
import com.glycemicgpt.mobile.data.remote.dto.PumpEventDto
import com.glycemicgpt.mobile.domain.model.BasalReading
import com.glycemicgpt.mobile.domain.model.BatteryStatus
import com.glycemicgpt.mobile.domain.model.BolusEvent
import com.glycemicgpt.mobile.domain.model.IoBReading
import com.glycemicgpt.mobile.domain.model.ReservoirReading
import com.squareup.moshi.Moshi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Converts domain models to PumpEventDto JSON and inserts them
 * into the sync_queue table for later upload.
 *
 * Enqueueing is gated on a backend being configured: with no base URL there is no
 * destination, so rows would only accumulate as undeliverable dead weight. Pump data
 * still reaches the local dashboard -- callers write to Room independently before
 * enqueueing.
 */
@Singleton
class SyncQueueEnqueuer @Inject constructor(
    private val syncDao: SyncDao,
    private val authTokenStore: AuthTokenStore,
    private val moshi: Moshi,
) {

    private val adapter = moshi.adapter(PumpEventDto::class.java)

    suspend fun enqueueIoB(reading: IoBReading) {
        enqueue(PumpEventMapper.fromIoB(reading))
    }

    suspend fun enqueueBasal(reading: BasalReading) {
        enqueue(PumpEventMapper.fromBasal(reading))
    }

    suspend fun enqueueBasalBatch(readings: List<BasalReading>) {
        readings.forEach { enqueue(PumpEventMapper.fromBasal(it)) }
    }

    suspend fun enqueueBoluses(events: List<BolusEvent>) {
        events.forEach { enqueue(PumpEventMapper.fromBolus(it)) }
    }

    suspend fun enqueueBattery(status: BatteryStatus) {
        enqueue(PumpEventMapper.fromBattery(status))
    }

    suspend fun enqueueReservoir(reading: ReservoirReading) {
        enqueue(PumpEventMapper.fromReservoir(reading))
    }

    private suspend fun enqueue(dto: PumpEventDto) {
        // Single funnel for the mode gate. All callers run on the polling orchestrator's
        // background coroutines, so the encrypted-store read stays off the main thread.
        if (!authTokenStore.isBackendConfigured()) return
        syncDao.enqueue(
            SyncQueueEntity(
                eventType = dto.eventType,
                eventTimestampMs = dto.eventTimestamp.toEpochMilli(),
                payload = adapter.toJson(dto),
            ),
        )
    }
}
