package com.glycemicgpt.mobile.service

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Connection state of the server-pushed alert stream (the SSE connection held by
 * [AlertStreamService]).
 *
 * - [CONNECTED] — the stream is open; server-pushed alerts are flowing.
 * - [RECONNECTING] — the stream dropped and a reconnect is scheduled (backoff inside the service).
 * - [DISCONNECTED] — the stream is not running: the service is stopped, there is no session, or no
 *   connection has been established yet this process.
 *
 * Anything other than [CONNECTED] means **no new server alerts arrive** — the UI must say so
 * honestly. A non-CONNECTED state is also half of the arm-condition for the on-device alert
 * floor ([AlertFloor], GLY-115): the phone alarms on threshold crossings itself, but ONLY off a
 * FRESH sensor reading — so the degraded surface may claim "watching" only when the floor's own
 * preconditions hold (see `alertFloorStatus`), and must say "NOT watching" otherwise.
 */
enum class AlertStreamState { CONNECTED, DISCONNECTED, RECONNECTING }

/**
 * Observable [AlertStreamState], the seam between [AlertStreamService] (an Android Service that
 * ViewModels cannot observe directly) and the UI surfaces that must react to the stream dropping.
 * The service drives the transitions; ViewModels collect [state].
 */
@Singleton
class AlertStreamStateHolder @Inject constructor() {

    private val _state = MutableStateFlow(AlertStreamState.DISCONNECTED)
    val state: StateFlow<AlertStreamState> = _state.asStateFlow()

    /** The SSE stream opened — server-pushed alerts are flowing again. */
    fun onStreamOpened() {
        _state.value = AlertStreamState.CONNECTED
    }

    /** The stream dropped or closed and the service has scheduled a reconnect. */
    fun onStreamRetrying() {
        _state.value = AlertStreamState.RECONNECTING
    }

    /** The stream is not running (service destroyed, no session, or no base URL/token). */
    fun onStreamStopped() {
        _state.value = AlertStreamState.DISCONNECTED
    }
}
