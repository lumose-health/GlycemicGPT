package com.glycemicgpt.mobile.presentation.onboarding

import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.remote.UrlSecurityPolicy
import com.glycemicgpt.mobile.data.repository.AuthRepository
import com.glycemicgpt.mobile.data.repository.LoginResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val authRepository = mockk<AuthRepository>(relaxed = true) {
        every { getBaseUrl() } returns null
        every { isLoggedIn() } returns false
    }
    private val appSettingsStore = mockk<AppSettingsStore>(relaxed = true)

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() = OnboardingViewModel(authRepository, appSettingsStore)

    @Test
    fun `initial state has empty defaults`() {
        val vm = createViewModel()
        val state = vm.uiState.value

        assertEquals("", state.baseUrl)
        assertFalse(state.isTestingConnection)
        assertNull(state.connectionTestResult)
        assertFalse(state.connectionTestSuccess)
        assertEquals("", state.email)
        assertEquals("", state.password)
        assertFalse(state.isLoggingIn)
        assertNull(state.loginError)
        assertFalse(state.onboardingComplete)
    }

    @Test
    fun `pre-fills baseUrl from token store`() {
        every { authRepository.getBaseUrl() } returns "https://saved.example.com"
        val vm = createViewModel()

        assertEquals("https://saved.example.com", vm.uiState.value.baseUrl)
    }

    @Test
    fun `getStartPage returns WELCOME for fresh install`() {
        every { authRepository.getBaseUrl() } returns null
        val vm = createViewModel()

        assertEquals(OnboardingPages.WELCOME, vm.getStartPage())
    }

    @Test
    fun `getStartPage returns SERVER for returning user who completed onboarding`() {
        every { authRepository.getBaseUrl() } returns "https://saved.example.com"
        every { appSettingsStore.onboardingComplete } returns true
        val vm = createViewModel()

        assertEquals(OnboardingPages.SERVER, vm.getStartPage())
    }

    @Test
    fun `getStartPage returns WELCOME when saved URL exists but onboarding not completed`() {
        every { authRepository.getBaseUrl() } returns "https://saved.example.com"
        every { appSettingsStore.onboardingComplete } returns false
        val vm = createViewModel()

        assertEquals(OnboardingPages.WELCOME, vm.getStartPage())
    }

    @Test
    fun `updateBaseUrl clears connection result`() {
        val vm = createViewModel()
        vm.updateBaseUrl("https://new.example.com")

        assertEquals("https://new.example.com", vm.uiState.value.baseUrl)
        assertNull(vm.uiState.value.connectionTestResult)
        assertFalse(vm.uiState.value.connectionTestSuccess)
    }

    @Test
    fun `testConnection success sets connectionTestSuccess`() = runTest {
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.testConnection() } returns Result.success("Connected successfully")
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")

        vm.testConnection()

        assertTrue(vm.uiState.value.connectionTestSuccess)
        assertEquals("Connected successfully", vm.uiState.value.connectionTestResult)
        assertFalse(vm.uiState.value.isTestingConnection)
    }

    @Test
    fun `testConnection failure clears connectionTestSuccess`() = runTest {
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.testConnection() } returns Result.failure(Exception("Connection refused"))
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")

        vm.testConnection()

        assertFalse(vm.uiState.value.connectionTestSuccess)
        assertTrue(vm.uiState.value.connectionTestResult!!.contains("Connection refused"))
        assertFalse(vm.uiState.value.isTestingConnection)
    }

    @Test
    fun `testConnection rejects blank URL`() {
        val vm = createViewModel()
        vm.testConnection()

        assertEquals("Enter a server URL first", vm.uiState.value.connectionTestResult)
        assertFalse(vm.uiState.value.connectionTestSuccess)
    }

    @Test
    fun `testConnection rejects invalid URL`() {
        every { authRepository.isValidUrl("not-a-url") } returns false
        every { authRepository.isBlockedPendingLanHttpOptIn("not-a-url") } returns false
        val vm = createViewModel()
        vm.updateBaseUrl("not-a-url")

        vm.testConnection()

        assertEquals(UrlSecurityPolicy.INVALID_URL_MESSAGE, vm.uiState.value.connectionTestResult)
        assertFalse(vm.uiState.value.connectionTestSuccess)
        assertFalse(vm.uiState.value.showInsecureHttpOptIn)
    }

    @Test
    fun `testConnection offers the insecure-HTTP opt-in for a blocked private http URL`() {
        every { authRepository.isValidUrl("http://10.20.66.40:3000") } returns false
        every { authRepository.isBlockedPendingLanHttpOptIn("http://10.20.66.40:3000") } returns true
        val vm = createViewModel()
        vm.updateBaseUrl("http://10.20.66.40:3000")

        vm.testConnection()

        assertEquals(UrlSecurityPolicy.INVALID_URL_MESSAGE, vm.uiState.value.connectionTestResult)
        assertTrue(vm.uiState.value.showInsecureHttpOptIn)
    }

    @Test
    fun `requestEnableInsecureHttp shows the acknowledgement without enabling`() {
        val vm = createViewModel()

        vm.requestEnableInsecureHttp()

        assertTrue(vm.uiState.value.showInsecureHttpConfirm)
        verify(exactly = 0) { appSettingsStore.allowInsecureLanHttp = any() }
    }

    @Test
    fun `confirmEnableInsecureHttp enables the setting and re-runs the connection test`() = runTest {
        every { authRepository.isValidUrl("http://10.20.66.40:3000") } returns true
        coEvery { authRepository.testConnection() } returns Result.success("Connected successfully")
        val vm = createViewModel()
        vm.updateBaseUrl("http://10.20.66.40:3000")
        vm.requestEnableInsecureHttp()

        vm.confirmEnableInsecureHttp()

        verify { appSettingsStore.allowInsecureLanHttp = true }
        assertFalse(vm.uiState.value.showInsecureHttpConfirm)
        assertFalse(vm.uiState.value.showInsecureHttpOptIn)
        assertTrue(vm.uiState.value.connectionTestSuccess)
    }

    @Test
    fun `dismissInsecureHttpConfirm hides the dialog and leaves the setting off`() {
        val vm = createViewModel()
        vm.requestEnableInsecureHttp()

        vm.dismissInsecureHttpConfirm()

        assertFalse(vm.uiState.value.showInsecureHttpConfirm)
        verify(exactly = 0) { appSettingsStore.allowInsecureLanHttp = any() }
    }

    @Test
    fun `login success requests notification permission before completing onboarding`() = runTest {
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.login(any(), any(), any(), any()) } returns LoginResult(
            success = true, email = "user@test.com",
        )
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")
        vm.updateEmail("user@test.com")
        vm.updatePassword("password123")

        vm.login()

        // After login, notification permission is requested but onboarding isn't complete yet
        assertTrue(vm.uiState.value.requestNotificationPermission)
        assertFalse(vm.uiState.value.onboardingComplete)
        assertFalse(vm.uiState.value.isLoggingIn)
        assertNull(vm.uiState.value.loginError)
        assertEquals("", vm.uiState.value.password)
        verify { appSettingsStore.onboardingComplete = true }
    }

    @Test
    fun `onNotificationPermissionHandled completes onboarding`() = runTest {
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.login(any(), any(), any(), any()) } returns LoginResult(
            success = true, email = "user@test.com",
        )
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")
        vm.updateEmail("user@test.com")
        vm.updatePassword("password123")

        vm.login()
        assertTrue(vm.uiState.value.requestNotificationPermission)
        assertFalse(vm.uiState.value.onboardingComplete)

        vm.onNotificationPermissionHandled()

        assertFalse(vm.uiState.value.requestNotificationPermission)
        assertTrue(vm.uiState.value.onboardingComplete)
    }

    @Test
    fun `continueWithoutServer requests notifications and persists onboarding without any auth`() = runTest {
        val vm = createViewModel()

        vm.continueWithoutServer()

        // SAFETY (AC2): the notification prompt is requested on the BLE-only path.
        assertTrue(vm.uiState.value.requestNotificationPermission)
        // Home navigation flips only after the permission is handled, mirroring the login tail.
        assertFalse(vm.uiState.value.onboardingComplete)
        // Persisted so the start destination becomes Home on relaunch.
        verify { appSettingsStore.onboardingComplete = true }
        // AC1: no base URL configured and no login performed on this path.
        coVerify(exactly = 0) { authRepository.login(any(), any(), any(), any()) }
        assertEquals("", vm.uiState.value.baseUrl)
    }

    @Test
    fun `continueWithoutServer clears a base URL persisted by a prior connection test`() = runTest {
        // A prior Test Connection persists the URL (AuthRepository.saveBaseUrl) before its result
        // resolves. Tapping BLE-only afterwards must leave NO backend configured (AC1/AC5), so the
        // completion clears the stored URL rather than merely not writing one.
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.testConnection() } returns Result.success("Connected successfully")
        val vm = createViewModel()
        vm.updateBaseUrl("https://typed.example.com")
        vm.testConnection()
        verify { authRepository.saveBaseUrl("https://typed.example.com") }

        vm.continueWithoutServer()

        // The invariant is enforced by clearing the store, not by hoping saveBaseUrl was never hit.
        verify { authRepository.clearBaseUrl() }
        assertEquals("", vm.uiState.value.baseUrl)
        assertFalse(vm.uiState.value.connectionTestSuccess)
    }

    @Test
    fun `continueWithoutServer cancels an in-flight connection test so it cannot re-save a URL`() = runTest {
        // Queue (don't eagerly run) the testConnection coroutine so we can tap BLE-only while it is
        // still in flight -- the race CodeRabbit flagged: the coroutine persists the typed URL
        // (and its failure branch restores a previous one), which would re-configure a backend
        // after continueWithoutServer cleared it.
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        every { authRepository.isValidUrl(any()) } returns true
        coEvery { authRepository.testConnection() } returns Result.failure(Exception("boom"))
        val vm = createViewModel()
        vm.updateBaseUrl("https://typed.example.com")

        vm.testConnection() // coroutine queued, not yet executed under StandardTestDispatcher
        vm.continueWithoutServer() // cancels the queued job before it can saveBaseUrl
        advanceUntilIdle() // drain: the cancelled job must not run its body

        verify { authRepository.clearBaseUrl() }
        verify(exactly = 0) { authRepository.saveBaseUrl(any()) }
    }

    @Test
    fun `BLE-only completion reaches onboarding done with no login`() = runTest {
        val vm = createViewModel()

        vm.continueWithoutServer()
        // Mutant proof: reverting the continueWithoutServer wiring leaves this false, so a
        // never-backend user never triggers the notification launcher and can't leave onboarding.
        assertTrue(vm.uiState.value.requestNotificationPermission)

        vm.onNotificationPermissionHandled()

        assertFalse(vm.uiState.value.requestNotificationPermission)
        assertTrue(vm.uiState.value.onboardingComplete)
        coVerify(exactly = 0) { authRepository.login(any(), any(), any(), any()) }
    }

    @Test
    fun `login failure shows error`() = runTest {
        coEvery { authRepository.login(any(), any(), any(), any()) } returns LoginResult(
            success = false, error = "Invalid email or password",
        )
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")
        vm.updateEmail("user@test.com")
        vm.updatePassword("wrong")

        vm.login()

        assertFalse(vm.uiState.value.onboardingComplete)
        assertEquals("Invalid email or password", vm.uiState.value.loginError)
        assertEquals("", vm.uiState.value.password)
    }

    @Test
    fun `login requires email and password`() {
        val vm = createViewModel()
        vm.updateBaseUrl("https://test.example.com")

        vm.login()

        assertEquals("Email and password are required", vm.uiState.value.loginError)
    }

    @Test
    fun `updateEmail clears login error`() {
        val vm = createViewModel()
        vm.login() // triggers error
        assertEquals("Email and password are required", vm.uiState.value.loginError)

        vm.updateEmail("test@example.com")
        assertNull(vm.uiState.value.loginError)
    }

    @Test
    fun `updatePassword clears login error`() {
        val vm = createViewModel()
        vm.login() // triggers error

        vm.updatePassword("newpass")
        assertNull(vm.uiState.value.loginError)
    }
}
