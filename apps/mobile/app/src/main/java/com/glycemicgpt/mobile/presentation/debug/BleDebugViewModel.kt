package com.glycemicgpt.mobile.presentation.debug

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.glycemicgpt.mobile.BuildConfig
import com.glycemicgpt.mobile.data.local.BleDebugStore
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.domain.model.CgmReading
import com.glycemicgpt.mobile.domain.model.CgmTrend
import com.glycemicgpt.mobile.domain.model.ConnectionState
import com.glycemicgpt.mobile.domain.pump.PumpConnectionManager
import com.glycemicgpt.mobile.service.PumpPollingOrchestrator
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

@HiltViewModel
class BleDebugViewModel @Inject constructor(
    private val debugStore: BleDebugStore,
    private val connectionManager: PumpConnectionManager,
    private val pumpDataRepository: PumpDataRepository,
    private val pollingOrchestrator: PumpPollingOrchestrator,
) : ViewModel() {

    val entries: StateFlow<List<BleDebugStore.Entry>> = debugStore.entries
    val connectionState: StateFlow<ConnectionState> = connectionManager.connectionState

    fun clearEntries() {
        debugStore.clear()
    }

    /**
     * Debug-only (reusable debug harness): seed a fresh in-range synthetic CGM reading so the
     * emulator — which has no live pump feed — can render the glucose hero and, combined
     * with the "Fast staleness" toggle, exercise the FRESH → STALE → TOO_STALE de-emphasis path.
     */
    fun injectTestCgm() {
        injectCgm(TEST_CGM_MG_DL, ageSeconds = 0)
    }

    /**
     * Debug-only: inject a LOW reading with a fresh sensor timestamp. With the backend fault
     * toggles on, this must FIRE the alert floor (GLY-115 AC1/AC10).
     */
    fun injectTestLowCgm() {
        injectCgm(TEST_LOW_CGM_MG_DL, ageSeconds = 0)
    }

    /**
     * Debug-only: inject a LOW reading whose sensor timestamp is already aged past the
     * compressed debug policy's TOO_STALE bound. The alert floor must SUPPRESS and the surface
     * must say "NOT watching" (GLY-115 AC2 — the safety test).
     */
    fun injectTestStaleLowCgm() {
        injectCgm(TEST_LOW_CGM_MG_DL, ageSeconds = TEST_STALE_AGE_SECONDS)
    }

    /**
     * Writes the synthetic reading to the same Room cache the real poll path uses, then drives
     * [PumpPollingOrchestrator.processCgmReading] — the exact production seam `pollCgm` calls —
     * so the watch relay and the alert floor see the injected reading exactly as they would a
     * polled one. The emulator has no BLE pump, so the poll loop never runs there.
     */
    private fun injectCgm(mgDl: Int, ageSeconds: Long) {
        // Defense-in-depth: this writes to the same Room cache that drives the real glucose hero
        // and can fire a real OS alarm, so hard-gate it to debug the same way the sibling
        // fault-injection settings are, not just via the debug-only navigation to this screen.
        if (!BuildConfig.DEBUG) return
        viewModelScope.launch {
            val reading = CgmReading(
                glucoseMgDl = mgDl,
                trendArrow = CgmTrend.FLAT,
                timestamp = Instant.now().minusSeconds(ageSeconds),
            )
            pumpDataRepository.saveCgm(reading)
            pollingOrchestrator.processCgmReading(reading)
        }
    }

    private companion object {
        const val TEST_CGM_MG_DL = 120
        const val TEST_LOW_CGM_MG_DL = 54

        /** Past CGM_DEBUG_FAST's tooStaleAfterMs (45s), so the injected reading lands TOO_STALE
         *  under the compressed policy the E2E runs with. */
        const val TEST_STALE_AGE_SECONDS = 60L
    }
}
