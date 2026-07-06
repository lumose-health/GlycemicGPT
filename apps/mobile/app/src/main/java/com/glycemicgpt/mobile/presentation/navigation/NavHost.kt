package com.glycemicgpt.mobile.presentation.navigation

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.glycemicgpt.mobile.data.auth.AuthState
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.presentation.alerts.AlertsScreen
import com.glycemicgpt.mobile.presentation.chat.AiChatScreen
import com.glycemicgpt.mobile.data.remote.UrlSecurityPolicy
import com.glycemicgpt.mobile.presentation.common.InsecureHttpBanner
import com.glycemicgpt.mobile.presentation.home.HomeScreen
import com.glycemicgpt.mobile.presentation.meal.CommonFoodsScreen
import com.glycemicgpt.mobile.presentation.meal.MealHistoryScreen
import com.glycemicgpt.mobile.presentation.meal.MealLogScreen
import com.glycemicgpt.mobile.BuildConfig
import com.glycemicgpt.mobile.presentation.debug.BleDebugScreen
import com.glycemicgpt.mobile.presentation.detail.AlertHistoryScreen
import com.glycemicgpt.mobile.presentation.detail.BolusHistoryScreen
import com.glycemicgpt.mobile.presentation.detail.ChartDetailScreen
import com.glycemicgpt.mobile.presentation.detail.InsulinDetailScreen
import com.glycemicgpt.mobile.presentation.detail.TirDetailScreen
import com.glycemicgpt.mobile.presentation.onboarding.OnboardingScreen
import com.glycemicgpt.mobile.presentation.pairing.PairingScreen
import com.glycemicgpt.mobile.presentation.plugin.PluginDetailScreen
import com.glycemicgpt.mobile.presentation.settings.SettingsScreen
import com.glycemicgpt.mobile.presentation.settings.SettingsViewModel

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    data object Home : Screen("home", "Home", Icons.Default.Home)
    data object AiChat : Screen("ai_chat", "AI Chat", Icons.Default.Chat)
    data object Alerts : Screen("alerts", "Alerts", Icons.Default.Notifications)
    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
    data object Pairing : Screen("pairing", "Pairing", Icons.Default.Bluetooth)
    data object BleDebug : Screen("ble_debug", "BLE Debug", Icons.Default.BugReport)
    data object Onboarding : Screen("onboarding", "Onboarding", Icons.Default.Home)
    data object PluginDetail : Screen("plugin_detail/{pluginId}/{cardId}", "Plugin Detail", Icons.Default.Settings)
    data object ChartDetail : Screen("chart_detail", "Chart", Icons.AutoMirrored.Filled.ShowChart)
    data object TirDetail : Screen("tir_detail", "Time in Range", Icons.Default.BarChart)
    data object InsulinDetail : Screen("insulin_detail", "Insulin", Icons.Default.Science)
    data object AlertHistory : Screen("alert_history", "Alert History", Icons.Default.History)
    data object BolusHistory : Screen("bolus_history", "Bolus History", Icons.Default.History)
    data object MealLog : Screen("meal_log", "Log a Meal", Icons.Default.Restaurant)
    data object MealHistory : Screen("meal_history", "Meal History", Icons.Default.History)
    data object CommonFoods : Screen("common_foods", "Common Foods", Icons.Default.Fastfood)
}

/**
 * Bottom-nav policy: capability-driven, not static. AI Chat is backend-only (there is no
 * on-device model), so in BLE-only mode the tab is absent rather than dead-ending on a
 * "check your server URL" error for a server the user deliberately never configured.
 */
internal fun bottomNavItems(backendConfigured: Boolean): List<Screen> = buildList {
    add(Screen.Home)
    if (backendConfigured) add(Screen.AiChat)
    add(Screen.Alerts)
    add(Screen.Settings)
}

/**
 * Start-destination policy: keyed on onboarding completion ALONE, deliberately
 * independent of session validity. Routing an expired session to Onboarding
 * would lock the local Room-served pump/CGM reads behind a login that cannot
 * succeed offline (a refresh token that expires mid-offline-stretch would
 * otherwise re-onboard the user). A session-less Home surfaces the tappable
 * session banner instead, and every network surface keeps its own session
 * guard.
 */
internal fun startDestinationRoute(onboardingComplete: Boolean): String =
    if (onboardingComplete) Screen.Home.route else Screen.Onboarding.route

/**
 * Session-banner policy: a message only for RESOLVED session-less states.
 * Initializing is the pre-validation default -- rendering the banner off it
 * would flash "not signed in" at cold start before
 * [com.glycemicgpt.mobile.data.auth.AuthManager.validateOnStartup] resolves
 * the real state. Refreshing and Authenticated are live sessions.
 *
 * Unauthenticated additionally requires a configured backend: a BLE-only user
 * is permanently Unauthenticated by design, and there is nothing to sign in
 * to. Expired stays unconditional -- it can only be reached from a session
 * that once existed, and that lapsed-session nudge must survive even if the
 * base URL is momentarily unreadable.
 */
internal fun sessionBannerMessage(state: AuthState, backendConfigured: Boolean): String? = when (state) {
    is AuthState.Expired -> state.message
    is AuthState.Unauthenticated -> if (backendConfigured) "Not signed in, tap to sign in" else null
    is AuthState.Initializing, is AuthState.Refreshing, is AuthState.Authenticated -> null
}

// Routes that show their own TopAppBar + back button; bottom nav is hidden on these.
private val spokeRoutes = setOf(
    Screen.ChartDetail.route,
    Screen.TirDetail.route,
    Screen.InsulinDetail.route,
    Screen.AlertHistory.route,
    Screen.BolusHistory.route,
    Screen.PluginDetail.route,
    Screen.Pairing.route,
    Screen.BleDebug.route,
    Screen.MealLog.route,
    Screen.MealHistory.route,
    Screen.CommonFoods.route,
)

@Composable
fun GlycemicGptNavHost(appSettingsStore: AppSettingsStore, authTokenStore: AuthTokenStore) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val settingsViewModel: SettingsViewModel = hiltViewModel()
    val authState by settingsViewModel.authState.collectAsState()

    val startDestination = remember {
        startDestinationRoute(appSettingsStore.onboardingComplete)
    }

    val isOnboarding = currentDestination?.route == Screen.Onboarding.route
    val showBottomNav = !isOnboarding && currentDestination?.route !in spokeRoutes

    // Persistent insecure-HTTP indicator: shown whenever the opt-in is on and the server base URL
    // is cleartext http://. Both halves are observed reactively (settings flow + base-URL flow) so
    // the banner tracks a toggle flip OR a server-URL change immediately, not only on the next
    // navigation.
    val insecureHttpFlow = remember { appSettingsStore.allowInsecureLanHttpFlow() }
    val insecureHttpEnabled by insecureHttpFlow.collectAsState(
        initial = appSettingsStore.allowInsecureLanHttp,
    )
    val baseUrlFlow = remember { authTokenStore.baseUrlFlow() }
    val baseUrl by baseUrlFlow.collectAsState(initial = authTokenStore.getBaseUrl())
    // Derive from the policy (single source of truth) so the banner shows only when the app would
    // actually send cleartext -- never for a public http:// URL the request layer rejects.
    val showInsecureHttpBanner = baseUrl?.let {
        UrlSecurityPolicy.isActiveInsecureHttp(it, BuildConfig.DEBUG, insecureHttpEnabled)
    } == true

    // App mode (GLY-146): full-stack vs BLE-only, via the canonical predicate over the SAME
    // reactive baseUrl collected above (backendConfiguredFlow() is exactly this mapping over
    // baseUrlFlow()). Deriving from the existing collection -- whose initial value is a
    // synchronous read -- avoids a pessimistic false seed that would yank a restored AI-chat
    // back stack to Home on the first frame for a full-stack user.
    val backendConfigured = AuthTokenStore.isBackendConfigured(baseUrl)
    val navItems = bottomNavItems(backendConfigured)
    // The NavHost builder's content lambdas are long-lived closures (the graph can be cached
    // across recompositions), so the route guards must read the mode through State rather
    // than capture the plain Boolean -- a by-value capture would freeze the gating decision
    // at graph-build time and ignore a server added or removed mid-session.
    val backendConfiguredState = rememberUpdatedState(backendConfigured)

    // Observe logout -> onboarding navigation event
    LaunchedEffect(Unit) {
        settingsViewModel.navigateToOnboarding.collect {
            navController.navigate(Screen.Onboarding.route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    // Navigate back to Home when auth state transitions to Authenticated while on onboarding.
    // This handles the case where the user was briefly shown onboarding due to a stale
    // start destination, but the async token refresh succeeded.
    LaunchedEffect(authState, isOnboarding) {
        if (isOnboarding && authState is AuthState.Authenticated && appSettingsStore.onboardingComplete) {
            navController.navigate(Screen.Home.route) {
                popUpTo(Screen.Onboarding.route) { inclusive = true }
            }
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomNav) {
                NavigationBar {
                    navItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = screen.label) },
                            label = { Text(screen.label) },
                            selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding)) {
            // Insecure-HTTP indicator: visible everywhere (including onboarding) while active.
            if (showInsecureHttpBanner) {
                InsecureHttpBanner()
            }

            // Session banner (not shown during onboarding). Covers both
            // RESOLVED session-less states so a Home rendered without a
            // session -- now reachable at cold start by design -- always
            // surfaces a tappable path to the Settings sign-in. The policy
            // (incl. staying silent while Initializing) lives in
            // sessionBannerMessage().
            if (!isOnboarding) {
                sessionBannerMessage(authState, backendConfigured)?.let { message ->
                    SessionExpiredBanner(
                        message = message,
                        onClick = {
                            navController.navigate(Screen.Settings.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                            }
                        },
                    )
                }
            }

            NavHost(
                navController = navController,
                startDestination = startDestination,
            ) {
                composable(Screen.Onboarding.route) {
                    OnboardingScreen(
                        onOnboardingComplete = {
                            navController.navigate(Screen.Home.route) {
                                popUpTo(Screen.Onboarding.route) { inclusive = true }
                            }
                        },
                    )
                }
                composable(Screen.Home.route) {
                    HomeScreen(
                        onPluginCardTap = { pluginId, cardId ->
                            navController.navigate(
                                "plugin_detail/${Uri.encode(pluginId)}/${Uri.encode(cardId)}",
                            )
                        },
                        onNavigateToChartDetail = { navController.navigate(Screen.ChartDetail.route) },
                        onNavigateToTirDetail = { navController.navigate(Screen.TirDetail.route) },
                        onNavigateToInsulinDetail = { navController.navigate(Screen.InsulinDetail.route) },
                        onNavigateToAlertHistory = { navController.navigate(Screen.AlertHistory.route) },
                        onNavigateToBolusHistory = { navController.navigate(Screen.BolusHistory.route) },
                        onNavigateToMealLog = { navController.navigate(Screen.MealLog.route) },
                        onNavigateToMealHistory = { navController.navigate(Screen.MealHistory.route) },
                    )
                }
                backendGatedComposable(Screen.AiChat.route, navController, backendConfiguredState) {
                    AiChatScreen()
                }
                composable(Screen.Alerts.route) { AlertsScreen() }
                composable(Screen.Settings.route) {
                    SettingsScreen(
                        settingsViewModel = settingsViewModel,
                        onNavigateToPairing = {
                            navController.navigate(Screen.Pairing.route)
                        },
                        onNavigateToBleDebug = if (BuildConfig.DEBUG) {
                            { navController.navigate(Screen.BleDebug.route) }
                        } else {
                            null
                        },
                        onNavigateToMealLog = { navController.navigate(Screen.MealLog.route) },
                    )
                }
                backendGatedComposable(Screen.MealLog.route, navController, backendConfiguredState) {
                    MealLogScreen(
                        onBack = { navController.popBackStack() },
                        onNavigateToHistory = { navController.navigate(Screen.MealHistory.route) },
                        onNavigateToCommonFoods = { navController.navigate(Screen.CommonFoods.route) },
                    )
                }
                backendGatedComposable(Screen.MealHistory.route, navController, backendConfiguredState) {
                    MealHistoryScreen(onBack = { navController.popBackStack() })
                }
                backendGatedComposable(Screen.CommonFoods.route, navController, backendConfiguredState) {
                    CommonFoodsScreen(onBack = { navController.popBackStack() })
                }
                composable(Screen.Pairing.route) {
                    PairingScreen(
                        onPaired = { navController.popBackStack() },
                    )
                }
                if (BuildConfig.DEBUG) {
                    composable(Screen.BleDebug.route) {
                        BleDebugScreen()
                    }
                }
                composable(
                    route = Screen.PluginDetail.route,
                    arguments = listOf(
                        navArgument("pluginId") { type = NavType.StringType },
                        navArgument("cardId") { type = NavType.StringType },
                    ),
                ) { backStackEntry ->
                    val pluginId = backStackEntry.arguments?.getString("pluginId") ?: return@composable
                    val cardId = backStackEntry.arguments?.getString("cardId") ?: return@composable
                    PluginDetailScreen(
                        pluginId = pluginId,
                        cardId = cardId,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(Screen.ChartDetail.route) {
                    val homeEntry = remember(it) {
                        try {
                            navController.getBackStackEntry(Screen.Home.route)
                        } catch (_: IllegalArgumentException) {
                            null
                        }
                    }
                    if (homeEntry == null) {
                        LaunchedEffect(Unit) { navController.popBackStack() }
                        return@composable
                    }
                    ChartDetailScreen(
                        onBack = { navController.popBackStack() },
                        viewModel = hiltViewModel(homeEntry),
                    )
                }
                composable(Screen.TirDetail.route) {
                    TirDetailScreen(onBack = { navController.popBackStack() })
                }
                composable(Screen.InsulinDetail.route) {
                    InsulinDetailScreen(onBack = { navController.popBackStack() })
                }
                composable(Screen.AlertHistory.route) {
                    AlertHistoryScreen(onBack = { navController.popBackStack() })
                }
                composable(Screen.BolusHistory.route) {
                    val homeEntry = remember(it) {
                        try {
                            navController.getBackStackEntry(Screen.Home.route)
                        } catch (_: IllegalArgumentException) {
                            null
                        }
                    }
                    if (homeEntry == null) {
                        LaunchedEffect(Unit) { navController.popBackStack() }
                        return@composable
                    }
                    BolusHistoryScreen(
                        onBack = { navController.popBackStack() },
                        viewModel = hiltViewModel(homeEntry),
                    )
                }
            }
        }
    }
}

/**
 * Registers a backend-only destination (GLY-146). The registration is kept in BLE-only mode
 * -- dropping the composable instead would blank the screen for a restored back stack or
 * deep link that still points at the route -- but the content is guarded: with no backend
 * the route redirects to Home. The mode arrives as [State] so the guard reads the live
 * value on every composition of the destination.
 */
private fun NavGraphBuilder.backendGatedComposable(
    route: String,
    navController: NavHostController,
    backendConfigured: State<Boolean>,
    content: @Composable () -> Unit,
) {
    composable(route) {
        if (backendConfigured.value) {
            content()
        } else {
            RedirectToHome(navController)
        }
    }
}

/**
 * Guard body for a backend-only route rendered in BLE-only mode. Renders nothing and
 * replaces the current entry with Home, so neither back navigation nor state restoration
 * can land on the empty guard frame.
 */
@Composable
private fun RedirectToHome(navController: NavHostController) {
    LaunchedEffect(Unit) {
        navController.navigate(Screen.Home.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
        }
    }
}

@Composable
private fun SessionExpiredBanner(message: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.errorContainer)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Warning,
                // Decorative: the adjacent Text carries the state-specific message.
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onErrorContainer,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
    }
}
