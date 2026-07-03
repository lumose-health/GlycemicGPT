package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.repository.AlertAckHttpException
import com.glycemicgpt.mobile.data.repository.AlertRepository
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.confirmVerified
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * Behavioral tests for the "Got It" acknowledge sequence — the GLY-130 live-defect fix.
 *
 * The defect: the local silence operations (cancel notification, restore alarm volume, clear
 * the dedup id) were nested inside the server ack's `.onSuccess`, so with the backend
 * unreachable a firing safety alarm could not be silenced. These tests pin the fixed contract:
 * every local operation runs unconditionally and BEFORE the server POST, so a future refactor
 * that re-gates silence on the network outcome (or reorders the POST ahead of silencing)
 * fails here instead of shipping.
 */
class AlertActionReceiverTest {

    private lateinit var alertRepository: AlertRepository
    private lateinit var alertNotificationManager: AlertNotificationManager
    private lateinit var alertFloor: AlertFloor
    private lateinit var receiver: AlertActionReceiver

    @Before
    fun setUp() {
        alertRepository = mockk {
            coEvery { markAcknowledgedLocally(any()) } just Runs
        }
        alertNotificationManager = mockk(relaxUnitFun = true)
        alertFloor = mockk {
            coEvery { onFloorAlertAcknowledged(any()) } just Runs
        }
        receiver = AlertActionReceiver().apply {
            alertRepository = this@AlertActionReceiverTest.alertRepository
            alertNotificationManager = this@AlertActionReceiverTest.alertNotificationManager
            alertFloor = this@AlertActionReceiverTest.alertFloor
        }
    }

    // -- the safety contract: silence never depends on the network -----------------------------

    @Test
    fun `backend unreachable - every local silence op still runs`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns
            Result.failure(IOException("backend unreachable"))

        receiver.handleAcknowledge("srv-1", notificationId = 42)

        // The exact live defect being locked: the ack POST failed, yet the alarm is silenced.
        coVerify(exactly = 1) { alertRepository.markAcknowledgedLocally("srv-1") }
        verify(exactly = 1) { alertNotificationManager.cancelNotification(42) }
        verify(exactly = 1) { alertNotificationManager.restoreAlarmVolume() }
        verify(exactly = 1) { alertNotificationManager.markAcknowledged("srv-1") }
    }

    @Test
    fun `silence ops run before the server POST, with the Room mark first`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns
            Result.failure(IOException("backend unreachable"))

        receiver.handleAcknowledge("srv-1", notificationId = 42)

        // Ordering is the invariant, not an implementation detail: the Room mark must land
        // before anything else (an SSE re-delivery mid-silence must hit the acknowledged-row
        // guard), and every silence op must complete before the network attempt begins — a
        // slow or hung POST may never delay quieting the alarm.
        coVerifyOrder {
            alertRepository.markAcknowledgedLocally("srv-1")
            alertNotificationManager.cancelNotification(42)
            alertNotificationManager.restoreAlarmVolume()
            alertNotificationManager.markAcknowledged("srv-1")
            alertRepository.acknowledgeAlert("srv-1")
        }
    }

    @Test
    fun `server failure produces no further side effects - it is logged and deferred, nothing more`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns
            Result.failure(AlertAckHttpException(500, terminal = false))

        receiver.handleAcknowledge("srv-1", notificationId = 42)

        // Everything the sequence is allowed to do is verified below; confirmVerified then
        // proves the failure branch touched nothing else (no un-silencing, no retries here —
        // the deferred ack belongs to the reconcile pass).
        coVerify(exactly = 1) { alertRepository.markAcknowledgedLocally("srv-1") }
        coVerify(exactly = 1) { alertRepository.acknowledgeAlert("srv-1") }
        verify(exactly = 1) { alertNotificationManager.cancelNotification(42) }
        verify(exactly = 1) { alertNotificationManager.restoreAlarmVolume() }
        verify(exactly = 1) { alertNotificationManager.markAcknowledged("srv-1") }
        confirmVerified(alertRepository, alertNotificationManager)
    }

    @Test
    fun `missing notification id - the id-free silence ops still run`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns
            Result.failure(IOException("backend unreachable"))

        receiver.handleAcknowledge("srv-1", notificationId = -1)

        verify(exactly = 0) { alertNotificationManager.cancelNotification(any()) }
        verify(exactly = 1) { alertNotificationManager.restoreAlarmVolume() }
        verify(exactly = 1) { alertNotificationManager.markAcknowledged("srv-1") }
        coVerify(exactly = 1) { alertRepository.markAcknowledgedLocally("srv-1") }
    }

    @Test
    fun `online success runs the identical local sequence - silence is unconditional both ways`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns Result.success(Unit)

        receiver.handleAcknowledge("srv-1", notificationId = 42)

        coVerifyOrder {
            alertRepository.markAcknowledgedLocally("srv-1")
            alertNotificationManager.cancelNotification(42)
            alertNotificationManager.restoreAlarmVolume()
            alertNotificationManager.markAcknowledged("srv-1")
            alertRepository.acknowledgeAlert("srv-1")
        }
    }

    // -- floor alerts (GLY-115): local-only acknowledgement -------------------------------------

    @Test
    fun `floor alert ack silences locally and never POSTs the synthetic id to the server`() = runTest {
        val floorId = AlertNotificationManager.LOCAL_FLOOR_ID_PREFIX + "low_urgent:1750000000000"

        receiver.handleAcknowledge(floorId, notificationId = 42)

        // The full local silence sequence still runs (a floor alarm must be silenceable exactly
        // like a server one)...
        coVerify(exactly = 1) { alertRepository.markAcknowledgedLocally(floorId) }
        verify(exactly = 1) { alertNotificationManager.cancelNotification(42) }
        verify(exactly = 1) { alertNotificationManager.restoreAlarmVolume() }
        verify(exactly = 1) { alertNotificationManager.markAcknowledged(floorId) }
        // ...the floor's cooldown for the type is cleared (ack-gated dedup, mirroring the
        // server: a NEW crossing minutes later must alarm again)...
        coVerify(exactly = 1) { alertFloor.onFloorAlertAcknowledged("low_urgent") }
        // ...but there is no server record: the synthetic id must never reach the ack endpoint.
        coVerify(exactly = 0) { alertRepository.acknowledgeAlert(any()) }
        confirmVerified(alertRepository, alertNotificationManager, alertFloor)
    }

    @Test
    fun `server alert ack never touches the floor cooldown`() = runTest {
        coEvery { alertRepository.acknowledgeAlert("srv-1") } returns Result.success(Unit)

        receiver.handleAcknowledge("srv-1", notificationId = 42)

        coVerify(exactly = 0) { alertFloor.onFloorAlertAcknowledged(any()) }
    }

    @Test
    fun `floor serverId parsing extracts the alert type and rejects malformed ids`() {
        assertEquals(
            "low_urgent",
            AlertActionReceiver.floorAlertTypeFromServerId("local-floor:low_urgent:175000"),
        )
        assertEquals(
            "high_warning",
            AlertActionReceiver.floorAlertTypeFromServerId("local-floor:high_warning:1"),
        )
        assertEquals(null, AlertActionReceiver.floorAlertTypeFromServerId("local-floor:"))
        assertEquals(null, AlertActionReceiver.floorAlertTypeFromServerId("local-floor:oops"))
    }

    // -- intent contract ------------------------------------------------------------------------

    @Test
    fun `action constants are stable`() {
        assertEquals(
            "com.glycemicgpt.mobile.ACTION_ACKNOWLEDGE_ALERT",
            AlertActionReceiver.ACTION_ACKNOWLEDGE,
        )
    }

    @Test
    fun `extra key constants are stable`() {
        assertEquals("extra_server_id", AlertActionReceiver.EXTRA_SERVER_ID)
        assertEquals("extra_notification_id", AlertActionReceiver.EXTRA_NOTIFICATION_ID)
    }
}
