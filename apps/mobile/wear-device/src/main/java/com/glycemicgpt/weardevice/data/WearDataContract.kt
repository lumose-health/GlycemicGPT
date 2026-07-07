package com.glycemicgpt.weardevice.data

// MIRROR: This contract must stay in sync with
// app/src/main/java/com/glycemicgpt/mobile/wear/WearDataContract.kt
object WearDataContract {
    // DataClient paths (persistent state sync)
    const val IOB_PATH = "/glycemicgpt/iob"
    const val CGM_PATH = "/glycemicgpt/cgm"
    const val ALERT_PATH = "/glycemicgpt/alert"

    // DataClient paths for history overlays (phone -> watch)
    const val BASAL_HISTORY_PATH = "/glycemicgpt/history/basal"
    const val BOLUS_HISTORY_PATH = "/glycemicgpt/history/bolus"
    const val IOB_HISTORY_PATH = "/glycemicgpt/history/iob"

    // History payload keys (compact byte arrays)
    const val KEY_HISTORY_DATA = "history_data"
    const val KEY_HISTORY_COUNT = "history_count"

    // IoB keys
    const val KEY_IOB_VALUE = "iob"
    const val KEY_IOB_TIMESTAMP = "iob_ts"

    // CGM keys
    const val KEY_CGM_MG_DL = "cgm_mgdl"
    const val KEY_CGM_TREND = "cgm_trend"
    const val KEY_CGM_TIMESTAMP = "cgm_ts"
    // Per-account glucose display unit ("mgdl"/"mmol"); value stays raw mg/dL, watch formats.
    const val KEY_GLUCOSE_UNIT = "glucose_unit"
    const val KEY_GLUCOSE_LOW = "glucose_low"
    const val KEY_GLUCOSE_HIGH = "glucose_high"
    const val KEY_GLUCOSE_URGENT_LOW = "glucose_urg_low"
    const val KEY_GLUCOSE_URGENT_HIGH = "glucose_urg_high"

    // Alert keys
    const val KEY_ALERT_TYPE = "alert_type"
    const val KEY_ALERT_BG_VALUE = "alert_bg"
    const val KEY_ALERT_TIMESTAMP = "alert_ts"
    const val KEY_ALERT_MESSAGE = "alert_msg"
    // False marks a silent refresh of an ongoing alert (updated value/timestamp, no watch
    // vibration); true (and absence, for older phone builds that only send on type change) is
    // a new crossing or the sustained-episode re-alarm.
    const val KEY_ALERT_REBUZZ = "alert_rebuzz"

    // Monitoring status path (phone -> watch, GLY-116 axis a): mirrors the phone's
    // AlertFloorStatus stream so the wrist can honestly say whether ANYTHING (server or the
    // phone's alert floor) is watching thresholds. The phone computes the coverage decision;
    // the watch only renders it and locally times it out (a frozen "watching" from a dead
    // phone must decay, never persist).
    const val MONITORING_STATUS_PATH = "/glycemicgpt/monitoring_status"

    // Monitoring status keys
    const val KEY_MONITORING_STATE = "mon_state"
    const val KEY_MONITORING_REASON = "mon_reason"
    // Watch-local decay window for this status, ms: one CGM staleness window under the
    // phone's ACTIVE policy (compressed when the debug fast-staleness toggle is on), so the
    // watch's timeout tracks the same clock the phone's own "watching" claim decays by.
    const val KEY_MONITORING_TIMEOUT_MS = "mon_timeout_ms"

    // KEY_MONITORING_STATE values. Vocabulary mirrors the phone's AlertFloorStatus exactly.
    const val MONITORING_STATE_SERVER_ACTIVE = "server_active"
    const val MONITORING_STATE_FLOOR_WATCHING = "floor_watching"
    const val MONITORING_STATE_NOT_WATCHING = "not_watching"

    // KEY_MONITORING_REASON values, present only with MONITORING_STATE_NOT_WATCHING.
    // MUST match the phone's FloorNotWatchingReason enum names exactly — the watch renders
    // reason-specific copy and an invented value would fall back to the generic line.
    const val MONITORING_REASON_NOTIFICATIONS_DENIED = "NOTIFICATIONS_DENIED"
    const val MONITORING_REASON_THRESHOLDS_NOT_SYNCED = "THRESHOLDS_NOT_SYNCED"
    const val MONITORING_REASON_THRESHOLDS_NOT_CONFIGURED = "THRESHOLDS_NOT_CONFIGURED"
    const val MONITORING_REASON_PUMP_DISCONNECTED = "PUMP_DISCONNECTED"
    const val MONITORING_REASON_NO_FRESH_READING = "NO_FRESH_READING"

    // MessageClient paths (transient chat relay)
    const val CHAT_REQUEST_PATH = "/glycemicgpt/chat/request"
    const val CHAT_RESPONSE_PATH = "/glycemicgpt/chat/response"
    const val CHAT_ERROR_PATH = "/glycemicgpt/chat/error"

    // Alert dismiss path (watch -> phone)
    const val ALERT_DISMISS_PATH = "/glycemicgpt/alert/dismiss"

    // ChannelClient paths (large data transfer)
    const val WATCHFACE_PUSH_CHANNEL = "/glycemicgpt/watchface/push"
    const val WATCH_APK_PUSH_CHANNEL = "/glycemicgpt/watch/apk/push"

    // Watch Face Push status paths (watch -> phone via MessageClient)
    const val WATCHFACE_PUSH_STATUS_PATH = "/glycemicgpt/watchface/status"

    // Watch APK self-update status path (watch -> phone via MessageClient)
    const val WATCH_APK_PUSH_STATUS_PATH = "/glycemicgpt/watch/apk/status"

    // Watch version sync path (watch -> phone via DataClient)
    const val WATCH_VERSION_PATH = "/glycemicgpt/watch/version"

    // Watch version keys
    const val KEY_WATCH_VERSION_NAME = "watch_ver_name"
    const val KEY_WATCH_VERSION_CODE = "watch_ver_code"
    const val KEY_WATCH_UPDATE_CHANNEL = "watch_update_ch"
    const val KEY_WATCH_DEV_BUILD_NUMBER = "watch_dev_build"

    // Watch face config sync path (phone -> watch via DataClient)
    const val CONFIG_PATH = "/glycemicgpt/watchface/config"

    // Watch face config keys
    const val KEY_CONFIG_SHOW_IOB = "cfg_show_iob"
    const val KEY_CONFIG_SHOW_GRAPH = "cfg_show_graph"
    const val KEY_CONFIG_SHOW_ALERT = "cfg_show_alert"
    const val KEY_CONFIG_SHOW_SECONDS = "cfg_show_seconds"
    const val KEY_CONFIG_GRAPH_RANGE_HOURS = "cfg_graph_range_h"
    const val KEY_CONFIG_THEME = "cfg_theme"
    const val KEY_CONFIG_SHOW_BASAL = "cfg_show_basal"
    const val KEY_CONFIG_SHOW_BOLUS = "cfg_show_bolus"
    const val KEY_CONFIG_SHOW_IOB_OVERLAY = "cfg_show_iob_ovl"
    const val KEY_CONFIG_SHOW_MODES = "cfg_show_modes"
    const val KEY_CONFIG_AI_TTS = "cfg_ai_tts"
    const val KEY_CONFIG_AI_TTS_VOICE = "cfg_ai_tts_voice"

    // Category labels sync path (phone -> watch via DataClient)
    const val CATEGORY_LABELS_PATH = "/glycemicgpt/category_labels"

    // Category labels key
    const val KEY_CATEGORY_LABELS_JSON = "cat_labels_json"

    // CapabilityClient capabilities
    const val CHAT_RELAY_CAPABILITY = "glycemicgpt_chat_relay"
    const val WATCH_APP_CAPABILITY = "glycemicgpt_watch_app"
}
