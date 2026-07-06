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
import kotlinx.coroutines.CancellationException
import timber.log.Timber
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
        enqueue(listOf(PumpEventMapper.fromIoB(reading)))
    }

    suspend fun enqueueBasal(reading: BasalReading) {
        enqueue(listOf(PumpEventMapper.fromBasal(reading)))
    }

    suspend fun enqueueBasalBatch(readings: List<BasalReading>) {
        enqueue(readings.map { PumpEventMapper.fromBasal(it) })
    }

    suspend fun enqueueBoluses(events: List<BolusEvent>) {
        enqueue(events.map { PumpEventMapper.fromBolus(it) })
    }

    suspend fun enqueueBattery(status: BatteryStatus) {
        enqueue(listOf(PumpEventMapper.fromBattery(status)))
    }

    suspend fun enqueueReservoir(reading: ReservoirReading) {
        enqueue(listOf(PumpEventMapper.fromReservoir(reading)))
    }

    private suspend fun enqueue(dtos: List<PumpEventDto>) {
        try {
            // Single funnel for the mode gate, checked once per call so history-backfill
            // batches don't re-read the encrypted store per event. Callers all run on the
            // polling orchestrator's background coroutines, keeping the read off the main
            // thread.
            if (dtos.isEmpty() || !authTokenStore.isBackendConfigured()) return
            for (dto in dtos) {
                syncDao.enqueue(
                    SyncQueueEntity(
                        eventType = dto.eventType,
                        eventTimestampMs = dto.eventTimestamp.toEpochMilli(),
                        payload = adapter.toJson(dto),
                    ),
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // The poll loops upstream have no catch of their own: a failed enqueue (keystore
            // flake, disk full) must not kill pump polling -- a dropped sync row is harmless,
            // a dead poll loop starves the dashboard and the alert floor.
            Timber.w(e, "Sync enqueue failed; dropped %d pump event(s)", dtos.size)
        }
    }
}
