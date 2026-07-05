package com.glycemicgpt.mobile.presentation.alerts

import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.data.repository.AlertAckHttpException
import com.glycemicgpt.mobile.data.repository.AlertRepository
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import com.glycemicgpt.mobile.service.AlertFloorStatusProvider
import com.glycemicgpt.mobile.service.AlertNotificationManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AlertsViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val alertsFlow = MutableStateFlow<List<AlertEntity>>(emptyList())
    private val networkStatusFlow = MutableStateFlow(NetworkStatus.REACHABLE)
    private val floorStatusFlow = MutableStateFlow<AlertFloorStatus>(AlertFloorStatus.ServerActive)
    private lateinit var repository: AlertRepository
    private lateinit var notificationManager: AlertNotificationManager
    private lateinit var appSettingsStore: AppSettingsStore
    private lateinit var alertFloorStatusProvider: AlertFloorStatusProvider
    private lateinit var authTokenStore: AuthTokenStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true) {
            every { observeRecentAlerts() } returns alertsFlow
            coEvery { fetchPendingAlerts() } returns Result.success(emptyList())
        }
        notificationManager = mockk(relaxed = true)
        appSettingsStore = mockk(relaxed = true) {
            every { glucoseUnit } returns GlucoseUnit.MGDL
            every { glucoseUnitFlow() } returns flowOf(GlucoseUnit.MGDL)
        }
        // The status pipeline itself is AlertFloorStatusProvider's (and alertFloorStatus's)
        // responsibility, covered by their own tests; here the VM just relays it.
        alertFloorStatusProvider = mockk {
            every { observe() } returns floorStatusFlow
            every { current() } answers { floorStatusFlow.value }
        }
        authTokenStore = mockk {
            every { baseUrlFlow() } returns flowOf("https://test.example.com")
            every { isBackendConfigured() } returns true
        }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() = AlertsViewModel(
        repository,
        notificationManager,
        appSettingsStore,
        alertFloorStatusProvider,
        authTokenStore,
    )

    private fun makeAlert(
        serverId: String = "alert-1",
        severity: String = "warning",
        currentValue: Double = 250.0,
        acknowledged: Boolean = false,
    ) = AlertEntity(
        serverId = serverId,
        alertType = "high_warning",
        severity = severity,
        message = "High glucose warning",
        currentValue = currentValue,
        timestampMs = System.currentTimeMillis(),
        acknowledged = acknowledged,
    )

    @Test
    fun `initial state is not loading with no error`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isLoading)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun `alerts flow emits when repository updates`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val collected = mutableListOf<List<AlertEntity>>()
        val job = backgroundScope.launch(testDispatcher) {
            vm.alerts.collect { collected.add(it) }
        }

        assertTrue(vm.alerts.value.isEmpty())

        val alert = makeAlert()
        alertsFlow.value = listOf(alert)

        assertEquals(1, vm.alerts.value.size)
        assertEquals("alert-1", vm.alerts.value[0].serverId)

        job.cancel()
    }

    @Test
    fun `glucoseUnit seeds from the cache and propagates flow emissions`() = runTest {
        val unitFlow = MutableStateFlow(GlucoseUnit.MGDL)
        every { appSettingsStore.glucoseUnit } returns GlucoseUnit.MGDL
        every { appSettingsStore.glucoseUnitFlow() } returns unitFlow
        val vm = createViewModel()

        val job = backgroundScope.launch(testDispatcher) { vm.glucoseUnit.collect { } }
        advanceUntilIdle()
        assertEquals(GlucoseUnit.MGDL, vm.glucoseUnit.value)

        unitFlow.value = GlucoseUnit.MMOL
        advanceUntilIdle()
        assertEquals(GlucoseUnit.MMOL, vm.glucoseUnit.value)

        job.cancel()
    }

    @Test
    fun `refreshAlerts calls fetchPendingAlerts`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.refreshAlerts()
        advanceUntilIdle()

        // Once from init, once from explicit call
        coVerify(atLeast = 2) { repository.fetchPendingAlerts() }
    }

    @Test
    fun `refreshAlerts sets user-facing error on failure, never the raw exception message`() = runTest {
        coEvery { repository.fetchPendingAlerts() } returns
            Result.failure(RuntimeException("java.net.SocketException: raw internals"))

        val vm = createViewModel()
        advanceUntilIdle()

        assertEquals("Couldn't refresh alerts. Try again.", vm.uiState.value.error)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `refreshAlerts offline failure reaches a terminal state with connection copy`() = runTest {
        coEvery { repository.fetchPendingAlerts() } returns
            Result.failure(IOException("connect timed out"))

        val vm = createViewModel()
        advanceUntilIdle()

        // Terminal: not loading, honest copy, no raw exception text.
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Can't reach your server — alerts may be out of date.", vm.uiState.value.error)
    }

    @Test
    fun `acknowledgeAlert calls repository`() = runTest {
        coEvery { repository.acknowledgeAlert("alert-1") } returns Result.success(Unit)

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        coVerify { repository.acknowledgeAlert("alert-1") }
    }

    @Test
    fun `acknowledgeAlert calls markAcknowledged on success`() = runTest {
        coEvery { repository.acknowledgeAlert("alert-1") } returns Result.success(Unit)

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        verify { notificationManager.markAcknowledged("alert-1") }
    }

    @Test
    fun `acknowledgeAlert clears the dedup id even when the server sync fails`() = runTest {
        // The repository marks the row locally regardless of the POST outcome (GLY-130), so the
        // in-memory dedup clear must be unconditional too — the alert is acknowledged either way.
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(IOException("backend unreachable"))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        verify { notificationManager.markAcknowledged("alert-1") }
    }

    @Test
    fun `acknowledgeAlert terminal rejection surfaces a real sync error, never the raw message`() = runTest {
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(AlertAckHttpException(403, terminal = true))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        assertEquals("Couldn't sync this acknowledgment to the server.", vm.uiState.value.error)
    }

    @Test
    fun `acknowledgeAlert unexpected failure shows generic copy, never the raw exception message`() = runTest {
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(RuntimeException("java.net.SocketException: raw internals"))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        assertEquals("Couldn't acknowledge the alert. Try again.", vm.uiState.value.error)
    }

    @Test
    fun `acknowledgeAlert offline shows honest deferred-sync copy, not an error`() = runTest {
        networkStatusFlow.value = NetworkStatus.OFFLINE
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(IOException("network unreachable"))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        assertEquals(
            "Acknowledged locally — will sync when reconnected.",
            vm.uiState.value.error,
        )
    }

    @Test
    fun `acknowledgeAlert transient 5xx shows deferred-sync copy - the row auto-reconciles`() = runTest {
        // The repository classified the failure as transient (row stays pending, will retry),
        // so the copy must promise the sync, not tell the user to try again.
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(AlertAckHttpException(503, terminal = false))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        assertEquals(
            "Acknowledged locally — will sync when reconnected.",
            vm.uiState.value.error,
        )
    }

    @Test
    fun `acknowledgeAlert transport blip while still marked reachable shows deferred-sync copy`() = runTest {
        // A single IOException can precede the NetworkMonitor flip (threshold = 2 failures).
        // The ack is still deferred-and-pending, so the copy stays truthful.
        networkStatusFlow.value = NetworkStatus.REACHABLE
        coEvery { repository.acknowledgeAlert("alert-1") } returns
            Result.failure(IOException("timeout"))

        val vm = createViewModel()
        advanceUntilIdle()

        vm.acknowledgeAlert("alert-1")
        advanceUntilIdle()

        assertEquals(
            "Acknowledged locally — will sync when reconnected.",
            vm.uiState.value.error,
        )
    }

    @Test
    fun `clearError resets error state`() = runTest {
        coEvery { repository.fetchPendingAlerts() } returns
            Result.failure(RuntimeException("fail"))

        val vm = createViewModel()
        advanceUntilIdle()

        assertEquals("Couldn't refresh alerts. Try again.", vm.uiState.value.error)

        vm.clearError()
        assertNull(vm.uiState.value.error)
    }

    // -- alertFloorStatus (GLY-115 AC7 banner input) -----------------------------
    // The pipeline (which inputs, what cadence) belongs to AlertFloorStatusProvider and the
    // pure alertFloorStatus(); these tests pin only the VM's relay-and-seed contract.

    @Test
    fun `status seeds from the provider snapshot and relays live emissions`() = runTest {
        floorStatusFlow.value = AlertFloorStatus.ServerActive
        val vm = createViewModel()

        val job = backgroundScope.launch(testDispatcher) { vm.alertFloorStatus.collect { } }
        runCurrent()
        assertEquals(AlertFloorStatus.ServerActive, vm.alertFloorStatus.value)

        floorStatusFlow.value = AlertFloorStatus.FloorWatching
        runCurrent()
        assertEquals(AlertFloorStatus.FloorWatching, vm.alertFloorStatus.value)

        floorStatusFlow.value =
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING)
        runCurrent()
        assertEquals(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING),
            vm.alertFloorStatus.value,
        )
        job.cancel()
    }

    @Test
    fun `cached alerts still display while alerting is degraded`() = runTest {
        networkStatusFlow.value = NetworkStatus.BACKEND_UNREACHABLE
        floorStatusFlow.value =
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING)
        coEvery { repository.fetchPendingAlerts() } returns
            Result.failure(IOException("unreachable"))
        alertsFlow.value = listOf(makeAlert())

        val vm = createViewModel()
        val degradedJob = backgroundScope.launch(testDispatcher) { vm.alertFloorStatus.collect { } }
        val alertsJob = backgroundScope.launch(testDispatcher) { vm.alerts.collect { } }
        runCurrent()

        assertTrue(vm.alertFloorStatus.value != AlertFloorStatus.ServerActive)
        assertEquals(1, vm.alerts.value.size)
        assertFalse(vm.uiState.value.isLoading)

        degradedJob.cancel()
        alertsJob.cancel()
    }
}
