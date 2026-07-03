package com.glycemicgpt.mobile.data.auth

import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.remote.dto.LoginResponse
import com.glycemicgpt.mobile.data.remote.dto.RefreshTokenRequest
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication state and refresh-token rotation.
 *
 * Single source of truth for the refresh-token mutex: both the proactive
 * timer and the reactive 401 interceptor route through the same lock here.
 * Without that, the two paths could rotate the token concurrently, leaving
 * any in-flight requests holding a now-twice-stale refresh token, which
 * the server's replay detector then rejects (issue #520).
 *
 * Responsibilities:
 * - Exposes observable [AuthState] via [authState]
 * - Validates tokens on startup
 * - Proactively refreshes access tokens before expiry ([performRefresh])
 * - Refreshes on demand from the 401 interceptor ([refreshForInterceptor])
 * - Handles refresh failures gracefully (emits [AuthState.Expired])
 */
@Singleton
class AuthManager @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val refreshClientProvider: RefreshClientProvider,
    private val moshi: Moshi,
) {
    /** Dispatcher for blocking IO operations. Overridable for testing. */
    var ioDispatcher: CoroutineDispatcher = Dispatchers.IO

    private val _authState = MutableStateFlow<AuthState>(AuthState.Unauthenticated)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    // Volatile because refreshJob is mutated from mixed lock contexts:
    // under refreshMutex by the refresh outcome branches, but lock-free by
    // validateOnStartup / onLoginSuccess (scheduling) and onLogout /
    // onRefreshFailed (cancellation, UI thread). Without @Volatile a stale
    // read could miss cancelling the live job.
    @Volatile
    private var refreshJob: Job? = null
    private val refreshMutex = Mutex()

    /**
     * Monotonic counter bumped by [onLogout] BEFORE the caller clears the
     * token store. A refresh call in flight across a logout compares its
     * entry snapshot against this counter and discards its result on
     * mismatch. Together with the bump-then-clear ordering in
     * [com.glycemicgpt.mobile.data.repository.AuthRepository.logout] this
     * closes the resurrection race completely: a rotated token can only be
     * persisted if the save completed before the bump -- in which case the
     * logout's subsequent store clear wipes it.
     *
     * Single writer (logout, UI thread); volatile is sufficient.
     */
    @Volatile
    private var sessionGeneration = 0L
    /** Retained scope for scheduling proactive refreshes from non-coroutine contexts. */
    @Volatile
    private var retainedScope: CoroutineScope? = null

    /** Outcome of a single refresh attempt under the mutex. */
    private sealed class RefreshOutcome {
        /** Token was rotated. */
        data class Success(val accessToken: String) : RefreshOutcome()

        /** Server rejected the refresh token (401/403) -- session is dead. */
        object Expired : RefreshOutcome()

        /** A logout landed while the refresh was in flight -- the result
         *  belongs to the previous session and was dropped. The store and
         *  auth state must be left alone: they are owned by the logout (or
         *  by a newer login) now. */
        object Discarded : RefreshOutcome()

        /** Server returned 5xx -- session preserved for retry. */
        object ServerError : RefreshOutcome()

        /** Network IO failure -- session preserved for retry, but treated as
         *  a fatal "no token available" outcome on the proactive path when
         *  there is no existing access token to fall back on. */
        object NetworkFailure : RefreshOutcome()
    }

    /**
     * Validates stored tokens on startup and schedules proactive refresh.
     * Call this from Application.onCreate() or the first ViewModel that loads.
     */
    fun validateOnStartup(scope: CoroutineScope) {
        retainedScope = scope
        val refreshToken = authTokenStore.getRefreshToken()
        if (refreshToken == null) {
            _authState.value = AuthState.Unauthenticated
            return
        }

        // Check if refresh token is expired
        if (authTokenStore.isRefreshTokenExpired()) {
            Timber.w("Refresh token expired on startup")
            _authState.value = AuthState.Expired()
            return
        }

        val accessToken = authTokenStore.getToken()
        if (accessToken != null) {
            // Valid access token exists
            _authState.value = AuthState.Authenticated
            scheduleProactiveRefresh(scope)
            return
        }

        // Access token expired but refresh token is valid -- attempt refresh with retry
        _authState.value = AuthState.Refreshing
        scope.launch {
            performRefreshWithRetry(scope)
        }
    }

    /**
     * Schedules a coroutine that refreshes the access token before it expires.
     * Re-schedules itself after each successful refresh.
     */
    fun scheduleProactiveRefresh(scope: CoroutineScope) {
        scheduleRefresh(scope, minDelayMs = 0)
    }

    /**
     * Schedules the next refresh attempt no earlier than [minDelayMs] from now.
     * The transient-failure branches of [performRefresh] pass
     * [TRANSIENT_RETRY_DELAY_MS] -- see that constant for why a floor is needed.
     */
    private fun scheduleRefresh(scope: CoroutineScope, minDelayMs: Long) {
        refreshJob?.cancel()
        refreshJob = scope.launch {
            val expiresAt = authTokenStore.getTokenExpiresAtMs()
            if (expiresAt <= 0) return@launch

            val refreshAt = expiresAt - AuthTokenStore.PROACTIVE_REFRESH_WINDOW_MS
            val delayMs = (refreshAt - System.currentTimeMillis()).coerceAtLeast(minDelayMs)

            Timber.d("Proactive refresh scheduled in ${delayMs / 1000}s")
            delay(delayMs)

            performRefresh(scope)
        }
    }

    /**
     * Proactive refresh entry point (called from the timer). Updates
     * [authState] based on the outcome and reschedules the proactive timer
     * on success.
     *
     * Serialized with [refreshForInterceptor] via [refreshMutex] so the
     * timer and the 401 interceptor cannot rotate the refresh token in
     * parallel.
     */
    suspend fun performRefresh(scope: CoroutineScope) {
        refreshMutex.withLock {
            // Fast path: another caller already produced a valid access token
            // and the auth state agrees (Authenticated). Nothing to do.
            //
            // The state check is load-bearing: scheduleProactiveRefresh runs
            // a recursive timer that re-enters performRefresh, and after a
            // transient 502/network failure we keep state=Authenticated with
            // an old access token. Using only `getToken() != null` here
            // would still let those recursive ticks bypass the fast path
            // and re-attempt the refresh forever.
            if (authTokenStore.getToken() != null && _authState.value is AuthState.Authenticated) {
                return
            }

            // Distinguish "never logged in" (no refresh token at all) from
            // "session was rejected" (server returned 401/403). The former
            // is Unauthenticated, the latter is Expired -- they trigger
            // different UI flows.
            if (authTokenStore.getRefreshToken() == null) {
                _authState.value = AuthState.Unauthenticated
                return
            }

            _authState.value = AuthState.Refreshing
            val generation = sessionGeneration
            when (val outcome = refreshUnderLock(generation)) {
                is RefreshOutcome.Success -> {
                    if (sessionGeneration != generation) {
                        // Logout raced this refresh; its store clear is the
                        // final word. Don't repaint Authenticated over it.
                        Timber.w("Ignoring refresh success after logout")
                        return
                    }
                    _authState.value = AuthState.Authenticated
                    scheduleProactiveRefresh(scope)
                }
                is RefreshOutcome.Expired -> {
                    authTokenStore.clearToken()
                    onRefreshFailedLocked()
                }
                is RefreshOutcome.Discarded -> {
                    // Logout raced this refresh; state and store now belong
                    // to the logout (or a newer login). Touch nothing.
                }
                is RefreshOutcome.ServerError -> {
                    // 5xx response -- preserve tokens for retry. If we have a
                    // (possibly expired) access token we can show stale data
                    // and schedule proactive retry. If we don't, leave state
                    // as Refreshing so performRefreshWithRetry attempts again.
                    val raw = authTokenStore.getRawToken()
                    if (raw != null) {
                        _authState.value = AuthState.Authenticated
                        scheduleRefresh(scope, TRANSIENT_RETRY_DELAY_MS)
                    }
                }
                is RefreshOutcome.NetworkFailure -> {
                    // Network IO error. Same fall-back as ServerError when we
                    // have a stored access token. Without one we treat the
                    // session as dead, matching prior behavior.
                    val raw = authTokenStore.getRawToken()
                    if (raw != null) {
                        _authState.value = AuthState.Authenticated
                        scheduleRefresh(scope, TRANSIENT_RETRY_DELAY_MS)
                    } else {
                        // Route through the shared failure path so the
                        // logout-wins guard applies here too.
                        onRefreshFailedLocked()
                    }
                }
            }
        }
    }

    /**
     * Reactive refresh entry point (called from [com.glycemicgpt.mobile.data.remote.TokenRefreshInterceptor]
     * when a request gets a 401). Returns the access token to retry with,
     * or null if the session is dead or the refresh failed transiently.
     *
     * Serialized with [performRefresh] via [refreshMutex]: any concurrent
     * 401s queue here, the first one performs the refresh, and every other
     * caller picks up the freshly-stored access token via the fast path.
     * No caller ever sends a stale refresh token to the server.
     *
     * @param originalToken the access token from the request that got a 401
     *   (i.e. the value of `Authorization: Bearer <originalToken>` on the
     *   originating request, or null if no header was sent). Used to break
     *   ties on the fast path: if the stored token is the same as the one
     *   that just got rejected, refreshing is the only way forward (don't
     *   loop on the rejected token).
     */
    suspend fun refreshForInterceptor(originalToken: String?): String? {
        refreshMutex.withLock {
            // Fast path: a valid access token is now stored AND it is not the
            // same one that just got rejected. Retry with it.
            //
            // This is the bug fix for #520. The previous interceptor compared
            // the original request's Authorization header with the stored
            // token, but [AuthInterceptor] omits the header entirely when
            // [AuthTokenStore.getToken] returns null (expired). With no
            // header to compare, the old double-check always fell through
            // to a fresh refresh, so every queued 401 in a burst rotated the
            // token, replaying the previous one each time. The fix is to
            // compare against `originalToken` (which is null when there was
            // no header) rather than against `original.header(...)`.
            //
            // The "not equal to originalToken" guard prevents an infinite
            // refresh loop when the server 401s a fresh token for a non-token
            // reason (e.g. revoked session, IP-bound auth): we'd otherwise
            // return the same token, retry, get another 401, return the same
            // token again, ad infinitum.
            authTokenStore.getToken()?.let { current ->
                if (current != originalToken) return current
            }

            // No valid token stored, or stored token is the same one that
            // just got rejected -- need to actually refresh.
            val generation = sessionGeneration
            return when (val outcome = refreshUnderLock(generation)) {
                is RefreshOutcome.Success -> {
                    if (sessionGeneration != generation) {
                        // Logout raced this refresh -- don't hand the caller
                        // a token for a session the user just ended.
                        Timber.w("Ignoring interceptor refresh success after logout")
                        return null
                    }
                    // Update state + reschedule proactive timer in-place so
                    // we don't need a separate callback round-trip from the
                    // interceptor.
                    onInterceptorRefreshSuccessLocked()
                    outcome.accessToken
                }
                is RefreshOutcome.Expired -> {
                    authTokenStore.clearToken()
                    onRefreshFailedLocked()
                    null
                }
                // Logout raced this refresh; hand the 401 back untouched.
                is RefreshOutcome.Discarded -> null
                // Transient failures (5xx, network) -- preserve session, hand
                // the 401 back to the caller. Don't change auth state from
                // here; the proactive timer will retry on its schedule. (The
                // proactive performRefresh() schedules a fresh timer on
                // transient failure, but the interceptor does not -- the
                // interceptor is reactive, not periodic, so it has no
                // schedule of its own to maintain.)
                is RefreshOutcome.ServerError -> null
                is RefreshOutcome.NetworkFailure -> null
            }
        }
    }

    /**
     * Performs the actual refresh network call and persists the result.
     * MUST be called with [refreshMutex] held.
     *
     * @param generation the caller's [sessionGeneration] snapshot from
     *   before the network call; a mismatch on return means a logout landed
     *   mid-flight and the rotated tokens must be discarded.
     */
    private suspend fun refreshUnderLock(generation: Long): RefreshOutcome {
        val refreshToken = authTokenStore.getRefreshToken()
            ?: return RefreshOutcome.Expired

        if (authTokenStore.isRefreshTokenExpired()) {
            Timber.w("Refresh token expired, cannot refresh")
            return RefreshOutcome.Expired
        }

        val baseUrl = authTokenStore.getBaseUrl()
        if (baseUrl.isNullOrBlank()) {
            Timber.w("No base URL configured, cannot refresh")
            return RefreshOutcome.Expired
        }

        return try {
            val body = RefreshTokenRequest(refreshToken = refreshToken)
            val adapter = moshi.adapter(RefreshTokenRequest::class.java)
            val json = adapter.toJson(body)

            val request = Request.Builder()
                .url("http://localhost/api/auth/mobile/refresh")
                .post(json.toRequestBody("application/json".toMediaType()))
                .build()

            val response = withContext(ioDispatcher) {
                refreshClientProvider.refreshClient.newCall(request).execute()
            }

            response.use { resp ->
                when {
                    resp.isSuccessful -> {
                        val responseBody = resp.body?.string()
                            ?: return@use RefreshOutcome.ServerError
                        val loginAdapter = moshi.adapter(LoginResponse::class.java)
                        val loginResponse = loginAdapter.fromJson(responseBody)
                            ?: return@use RefreshOutcome.ServerError

                        // Logout can land while the refresh call is in flight
                        // (it clears the store without taking the mutex).
                        // Persisting the rotated tokens would resurrect the
                        // logged-out session on the next cold start -- discard
                        // them and report the session dead instead. The
                        // generation check makes this airtight (see
                        // [sessionGeneration]): a save that slips through can
                        // only have completed before the logout's bump, and
                        // the logout's subsequent store clear wipes it.
                        if (_authState.value is AuthState.Unauthenticated || sessionGeneration != generation) {
                            Timber.w("Discarding refreshed tokens: logout occurred during refresh")
                            return@use RefreshOutcome.Discarded
                        }

                        val expiresAtMs = System.currentTimeMillis() + (loginResponse.expiresIn * 1000L)
                        authTokenStore.saveCredentials(
                            baseUrl,
                            loginResponse.accessToken,
                            expiresAtMs,
                            loginResponse.user.email,
                        )
                        authTokenStore.saveRefreshToken(loginResponse.refreshToken)
                        Timber.d("Token refreshed successfully")
                        RefreshOutcome.Success(loginResponse.accessToken)
                    }
                    resp.code == 401 || resp.code == 403 -> {
                        // Definitive auth rejection -- refresh token is invalid/revoked
                        Timber.w("Token refresh rejected with HTTP ${resp.code}, clearing session")
                        RefreshOutcome.Expired
                    }
                    else -> {
                        // 5xx server error -- preserve tokens for retry
                        Timber.w("Token refresh got HTTP ${resp.code}, preserving session for retry")
                        RefreshOutcome.ServerError
                    }
                }
            }
        } catch (e: CancellationException) {
            throw e // Never swallow coroutine cancellation
        } catch (e: java.io.IOException) {
            Timber.w(e, "Token refresh failed due to network error, preserving session")
            RefreshOutcome.NetworkFailure
        } catch (e: JsonDataException) {
            Timber.w(e, "Token refresh failed: malformed response, preserving session")
            RefreshOutcome.ServerError
        } catch (e: Exception) {
            Timber.w(e, "Token refresh failed unexpectedly, preserving session")
            RefreshOutcome.NetworkFailure
        }
    }

    /**
     * Updates auth state and reschedules the proactive refresh timer after
     * a successful interceptor-driven token refresh. Must be called with
     * [refreshMutex] held.
     */
    private fun onInterceptorRefreshSuccessLocked() {
        if (_authState.value is AuthState.Unauthenticated) {
            Timber.w("Ignoring interceptor refresh success after logout")
            return
        }
        _authState.value = AuthState.Authenticated
        val scope = retainedScope
        if (scope?.isActive == true) {
            scheduleProactiveRefresh(scope)
        } else {
            Timber.w("Skipping proactive refresh scheduling: retained scope unavailable or inactive")
        }
    }

    /**
     * Attempts refresh with retry for startup scenarios where a transient network
     * failure shouldn't immediately destroy the session.
     *
     * Checks for actual token acquisition (not just auth state) to determine
     * whether to retry: transient failures leave state as [AuthState.Refreshing]
     * (no stored access token to fall back on) or [AuthState.Authenticated] on
     * a stale token (stored token present).
     */
    private suspend fun performRefreshWithRetry(
        scope: CoroutineScope,
        maxAttempts: Int = 3,
    ) {
        for (attempt in 0 until maxAttempts) {
            performRefresh(scope)

            // Success: we obtained a valid access token
            if (authTokenStore.getToken() != null) return

            // Definitive failure: no point retrying
            val state = _authState.value
            if (state is AuthState.Expired || state is AuthState.Unauthenticated) return

            // Transient failure (Refreshing state) -- retry with backoff
            if (attempt < maxAttempts - 1) {
                val backoffMs = 1000L * (1 shl attempt) // 1s, 2s
                Timber.d("Startup refresh attempt ${attempt + 1} failed transiently, retrying in ${backoffMs}ms")
                delay(backoffMs)
            }
        }

        // All attempts exhausted without obtaining a token. Only flip to
        // Expired from Refreshing (transient failures with no stored access
        // token to fall back on) -- if a transient failure left us
        // Authenticated on a stored stale token, keep it: the session is
        // intact, we're just unable to reach the server, typically because
        // the device is offline. Downgrading to Expired there would show a
        // false "session expired" banner and prompt a re-login that cannot
        // succeed without connectivity. The transient-retry timer keeps
        // trying, and the 401 interceptor recovers the session on the first
        // request after reconnect. The positive Refreshing check also leaves
        // Expired and Unauthenticated (logout during the retry window) alone.
        if (authTokenStore.getToken() == null && _authState.value is AuthState.Refreshing) {
            Timber.w("Startup refresh exhausted all attempts without obtaining a token")
            _authState.value = AuthState.Expired()
        }
    }

    /** Called after a successful login to set the authenticated state. */
    fun onLoginSuccess(scope: CoroutineScope) {
        // Prefer the app-lifetime scope set by validateOnStartup() over the
        // caller-provided scope (which is often a ViewModel scope that dies
        // when the UI is torn down, breaking proactive refresh scheduling).
        val effectiveScope = retainedScope ?: scope.also { retainedScope = it }
        _authState.value = AuthState.Authenticated
        scheduleProactiveRefresh(effectiveScope)
    }

    /**
     * Called on logout to reset state. MUST be called BEFORE the token store
     * is cleared (see [sessionGeneration] for why the ordering closes the
     * refresh-in-flight resurrection race).
     */
    fun onLogout() {
        sessionGeneration++
        refreshJob?.cancel()
        refreshJob = null
        retainedScope = null
        _authState.value = AuthState.Unauthenticated
    }

    /**
     * Called by the 401 interceptor when refresh-token preconditions fail
     * (no token present, or token expired) -- i.e. cases the interceptor
     * rejects without ever calling [refreshForInterceptor].
     */
    fun onRefreshFailed() {
        onRefreshFailedLocked()
    }

    /**
     * Body of [onRefreshFailed], also reused from the refresh paths inside
     * [refreshMutex.withLock] so the Expired branches stay in sync. The
     * underlying operations (cancel a Job, set a StateFlow value) are both
     * thread-safe in their own right, so it is safe to call from either
     * locked or unlocked contexts.
     */
    private fun onRefreshFailedLocked() {
        // Logout wins: a late 401 or an in-flight refresh failure landing
        // after onLogout() must not overwrite the deliberate sign-out with
        // a "session expired" banner.
        if (_authState.value is AuthState.Unauthenticated) return
        refreshJob?.cancel()
        _authState.value = AuthState.Expired()
    }

    companion object {
        /**
         * Retry spacing for refresh reschedules after a transient failure
         * (network IO error or server 5xx). The access token's stored expiry
         * is in the past by then, so without a floor the reschedule delay
         * computes to 0 and refresh attempts spin back-to-back for as long
         * as the failure persists (e.g. the whole time the device is
         * offline). See also [AuthTokenStore.PROACTIVE_REFRESH_WINDOW_MS],
         * the other half of the refresh timer's scheduling policy.
         */
        internal const val TRANSIENT_RETRY_DELAY_MS = 60 * 1000L
    }
}
