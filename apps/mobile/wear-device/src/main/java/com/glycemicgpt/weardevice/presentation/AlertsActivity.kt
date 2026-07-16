package com.glycemicgpt.weardevice.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.data.WatchDataRepository.WristCoverage
import com.glycemicgpt.weardevice.data.WearDataContract
import com.glycemicgpt.weardevice.messaging.WearMessageSender
import com.glycemicgpt.weardevice.util.GlucoseDisplayUtils
import com.glycemicgpt.weardevice.util.WatchFreshness
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class AlertsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WearAlertScreen(onFinish = { finish() })
        }
    }
}

/**
 * The wrist alert surface, honest on both GLY-116 axes: with no alert showing, the green
 * "All clear" renders ONLY while the phone recently vouched that something is watching
 * (axis a, locally decayed); a shown alert is aged against the watch clock and de-emphasised
 * once its reading is TOO_STALE instead of looking active-indefinitely (axis b). The watch
 * renders the phone's coverage decision — it never computes its own.
 */
@Composable
private fun WearAlertScreen(onFinish: () -> Unit) {
    val alert by WatchDataRepository.alert.collectAsState()
    val glucoseUnit by WatchDataRepository.glucoseUnit.collectAsState()
    val monitoringStatus by WatchDataRepository.monitoringStatus.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var dismissing by remember { mutableStateOf(false) }

    // Both honesty axes decay with time, not only with new pushes, so the screen re-evaluates
    // on a ticker: a shown alert must grey out and a "watching" claim must expire even when
    // nothing new arrives (that silence is exactly the signal).
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(NOW_TICK_MS)
            nowMs = System.currentTimeMillis()
        }
    }

    MaterialTheme {
        Scaffold(timeText = { TimeText() }) {
            val currentAlert = alert
            if (currentAlert == null) {
                NoAlertContent(WatchDataRepository.coverageFrom(monitoringStatus, nowMs))
            } else {
                val alertAgeMs = nowMs - currentAlert.timestampMs
                val isDataStale =
                    WatchFreshness.cgmTier(alertAgeMs) == WatchFreshness.Tier.TOO_STALE
                val isUrgent = currentAlert.type.startsWith("urgent", ignoreCase = true)
                val alertColor = when {
                    isDataStale -> COLOR_MUTED
                    isUrgent -> COLOR_URGENT
                    else -> COLOR_WARNING
                }

                Column(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = formatAlertType(currentAlert.type),
                        style = MaterialTheme.typography.title3,
                        color = alertColor,
                        textAlign = TextAlign.Center,
                    )

                    // Gate compares the raw mg/dL Int; only the rendered text converts to the unit.
                    if (currentAlert.bgValue in 20..500) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = GlucoseDisplayUtils.formatWithLabel(currentAlert.bgValue, glucoseUnit),
                            fontSize = 20.sp,
                            color = alertColor,
                            textAlign = TextAlign.Center,
                        )
                    }

                    // The alert's age, always visible; once the underlying reading is TOO_STALE
                    // the line says so explicitly — the alert may still be true, nobody can
                    // currently vouch either way, and a silent retraction to "All clear" would
                    // be the opposite lie.
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (isDataStale) {
                            "as of ${GlucoseDisplayUtils.formatAge(alertAgeMs)} — data stale"
                        } else {
                            GlucoseDisplayUtils.formatAge(alertAgeMs)
                        },
                        style = MaterialTheme.typography.caption2,
                        color = COLOR_MUTED,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.testTag("alert_age"),
                    )

                    if (currentAlert.message.isNotBlank()) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = currentAlert.message,
                            style = MaterialTheme.typography.body2,
                            textAlign = TextAlign.Center,
                            maxLines = 3,
                        )
                    }

                    // A lingering stale alert occupies the screen the coverage banner would
                    // otherwise use — without this line, a dead phone behind a stale alert
                    // would surface no "not watching" cue on this screen at all.
                    val coverage = WatchDataRepository.coverageFrom(monitoringStatus, nowMs)
                    if (isDataStale && coverage !is WristCoverage.Watching) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Not watching — check your phone",
                            style = MaterialTheme.typography.caption2,
                            color = COLOR_WARNING,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.testTag("stale_alert_not_watching"),
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            if (dismissing) return@Button
                            dismissing = true
                            scope.launch {
                                WearMessageSender.sendAlertDismiss(context)
                                WatchDataRepository.clearAlert()
                                onFinish()
                            }
                        },
                        enabled = !dismissing,
                        modifier = Modifier.fillMaxWidth(0.8f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF374151),
                        ),
                    ) {
                        Text(
                            if (dismissing) "Dismissing..." else "Dismiss",
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

/**
 * The no-active-alert body. The reassuring green "All clear" is reserved for a current
 * "watching" claim; every other coverage state says plainly that nobody may be watching and
 * that caregiver + AI alerting need the backend.
 */
@Composable
private fun NoAlertContent(coverage: WristCoverage) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (coverage) {
            is WristCoverage.Watching -> {
                Text(
                    text = "No Active Alert",
                    style = MaterialTheme.typography.title3,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "All clear",
                    style = MaterialTheme.typography.body2,
                    color = COLOR_ALL_CLEAR,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("all_clear"),
                )
            }
            is WristCoverage.NotWatching -> {
                Text(
                    text = "Not watching",
                    style = MaterialTheme.typography.title3,
                    color = COLOR_WARNING,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("not_watching"),
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = notWatchingReasonCopy(coverage.reason),
                    style = MaterialTheme.typography.body2,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Caregiver & AI alerts are paused — they need the backend.",
                    style = MaterialTheme.typography.caption2,
                    color = COLOR_MUTED,
                    textAlign = TextAlign.Center,
                )
            }
            is WristCoverage.NoRecentStatus -> {
                Text(
                    text = "No recent data",
                    style = MaterialTheme.typography.title3,
                    color = COLOR_MUTED,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("no_recent_status"),
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "The watch hasn't heard from your phone recently. Alerts may not arrive.",
                    style = MaterialTheme.typography.body2,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/** Watch-facing copy per wire reason. Unknown reasons fall back to the generic line.
 *  Internal (not private) so [AlertsCopyTest] can pin every reason to a distinct line — a
 *  dropped or renamed arm silently degrades to the generic copy, the wear analogue of the
 *  store's silent-disarm. */
internal fun notWatchingReasonCopy(reason: String?): String = when (reason) {
    WearDataContract.MONITORING_REASON_NOTIFICATIONS_DENIED ->
        "Monitoring degraded — allow notifications on your phone."
    WearDataContract.MONITORING_REASON_THRESHOLDS_NOT_SYNCED ->
        "Monitoring degraded — alert thresholds haven't synced yet."
    WearDataContract.MONITORING_REASON_THRESHOLDS_NOT_CONFIGURED ->
        "Alerts off — set alert thresholds in the phone's Settings."
    WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED ->
        "Monitoring degraded — pump is disconnected."
    WearDataContract.MONITORING_REASON_NO_FRESH_READING ->
        "Monitoring degraded — no fresh glucose readings."
    else -> "Monitoring degraded — nothing is watching for lows or highs."
}

private fun formatAlertType(type: String): String {
    return type.replace("_", " ")
        .split(" ")
        .joinToString(" ") { word ->
            word.replaceFirstChar { it.uppercaseChar() }
        }
}

private val COLOR_URGENT = Color(0xFFEF4444)
private val COLOR_WARNING = Color(0xFFFBBF24)
private val COLOR_MUTED = Color(0xFF9CA3AF)
private val COLOR_ALL_CLEAR = Color(0xFF4ADE80)

/** Re-evaluation cadence for the age/coverage decay while the screen is up. */
private const val NOW_TICK_MS = 15_000L
