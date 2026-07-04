package com.glycemicgpt.weardevice.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearDataContractTest {

    @Test
    fun `all paths start with glycemicgpt prefix`() {
        val paths = listOf(
            WearDataContract.IOB_PATH,
            WearDataContract.CGM_PATH,
            WearDataContract.ALERT_PATH,
            WearDataContract.CHAT_REQUEST_PATH,
            WearDataContract.CHAT_RESPONSE_PATH,
            WearDataContract.CHAT_ERROR_PATH,
            WearDataContract.ALERT_DISMISS_PATH,
            WearDataContract.WATCHFACE_PUSH_CHANNEL,
            WearDataContract.WATCHFACE_PUSH_STATUS_PATH,
            WearDataContract.CONFIG_PATH,
            WearDataContract.CATEGORY_LABELS_PATH,
        )
        paths.forEach { path ->
            assertTrue("Path '$path' should start with /glycemicgpt/", path.startsWith("/glycemicgpt/"))
        }
    }

    @Test
    fun `paths match phone-side contract values`() {
        assertEquals("/glycemicgpt/iob", WearDataContract.IOB_PATH)
        assertEquals("/glycemicgpt/cgm", WearDataContract.CGM_PATH)
        assertEquals("/glycemicgpt/alert", WearDataContract.ALERT_PATH)
        assertEquals("/glycemicgpt/chat/request", WearDataContract.CHAT_REQUEST_PATH)
        assertEquals("/glycemicgpt/chat/response", WearDataContract.CHAT_RESPONSE_PATH)
        assertEquals("/glycemicgpt/chat/error", WearDataContract.CHAT_ERROR_PATH)
    }

    @Test
    fun `alert dismiss path is defined`() {
        assertEquals("/glycemicgpt/alert/dismiss", WearDataContract.ALERT_DISMISS_PATH)
    }

    @Test
    fun `watch face push paths are defined`() {
        assertEquals("/glycemicgpt/watchface/push", WearDataContract.WATCHFACE_PUSH_CHANNEL)
        assertEquals("/glycemicgpt/watchface/status", WearDataContract.WATCHFACE_PUSH_STATUS_PATH)
    }

    @Test
    fun `capability names are defined`() {
        assertEquals("glycemicgpt_chat_relay", WearDataContract.CHAT_RELAY_CAPABILITY)
        assertEquals("glycemicgpt_watch_app", WearDataContract.WATCH_APP_CAPABILITY)
    }

    @Test
    fun `config path is defined`() {
        assertEquals("/glycemicgpt/watchface/config", WearDataContract.CONFIG_PATH)
    }

    @Test
    fun `category labels path and key are defined`() {
        assertEquals("/glycemicgpt/category_labels", WearDataContract.CATEGORY_LABELS_PATH)
        assertEquals("cat_labels_json", WearDataContract.KEY_CATEGORY_LABELS_JSON)
    }

    @Test
    fun `cgm keys match phone-side contract values`() {
        assertEquals("cgm_mgdl", WearDataContract.KEY_CGM_MG_DL)
        assertEquals("cgm_trend", WearDataContract.KEY_CGM_TREND)
        assertEquals("cgm_ts", WearDataContract.KEY_CGM_TIMESTAMP)
        // Per-account display unit; must match the phone mirror or the watch can't read it.
        assertEquals("glucose_unit", WearDataContract.KEY_GLUCOSE_UNIT)
    }

    @Test
    fun `alert rebuzz key matches phone-side contract value`() {
        assertEquals("alert_rebuzz", WearDataContract.KEY_ALERT_REBUZZ)
    }

    @Test
    fun `monitoring status contract matches phone-side values`() {
        assertEquals("/glycemicgpt/monitoring_status", WearDataContract.MONITORING_STATUS_PATH)
        assertEquals("mon_state", WearDataContract.KEY_MONITORING_STATE)
        assertEquals("mon_reason", WearDataContract.KEY_MONITORING_REASON)
        assertEquals("mon_timeout_ms", WearDataContract.KEY_MONITORING_TIMEOUT_MS)
        assertEquals("server_active", WearDataContract.MONITORING_STATE_SERVER_ACTIVE)
        assertEquals("floor_watching", WearDataContract.MONITORING_STATE_FLOOR_WATCHING)
        assertEquals("not_watching", WearDataContract.MONITORING_STATE_NOT_WATCHING)
    }

    @Test
    fun `monitoring reason strings are pinned literally - the enforcing half is the phone-side test`() {
        // This module cannot see the phone's FloorNotWatchingReason enum; the cross-module
        // guarantee (wire strings == enum names) is asserted in the phone's WearDataContractTest.
        assertEquals("NOTIFICATIONS_DENIED", WearDataContract.MONITORING_REASON_NOTIFICATIONS_DENIED)
        assertEquals("THRESHOLDS_NOT_SYNCED", WearDataContract.MONITORING_REASON_THRESHOLDS_NOT_SYNCED)
        assertEquals("PUMP_DISCONNECTED", WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED)
        assertEquals("NO_FRESH_READING", WearDataContract.MONITORING_REASON_NO_FRESH_READING)
    }

    @Test
    fun `config keys are defined`() {
        assertEquals("cfg_show_iob", WearDataContract.KEY_CONFIG_SHOW_IOB)
        assertEquals("cfg_show_graph", WearDataContract.KEY_CONFIG_SHOW_GRAPH)
        assertEquals("cfg_show_alert", WearDataContract.KEY_CONFIG_SHOW_ALERT)
        assertEquals("cfg_show_seconds", WearDataContract.KEY_CONFIG_SHOW_SECONDS)
        assertEquals("cfg_graph_range_h", WearDataContract.KEY_CONFIG_GRAPH_RANGE_HOURS)
        assertEquals("cfg_theme", WearDataContract.KEY_CONFIG_THEME)
    }
}
