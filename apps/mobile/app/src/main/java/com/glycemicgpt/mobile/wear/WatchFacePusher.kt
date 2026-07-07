package com.glycemicgpt.mobile.wear

import android.content.Context
import com.glycemicgpt.mobile.BuildConfig
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pushes the bundled WFF watch face APK from app assets to the watch
 * via [ChannelClient]. The watch-side
 * `com.glycemicgpt.weardevice.push.WatchFaceReceiveService` receives
 * the bytes and installs via the Watch Face Push API.
 *
 * Usage:
 * ```
 * val result = watchFacePusher.pushWatchFace()
 * when (result) {
 *     is WatchFacePusher.Result.Success -> // face sent
 *     is WatchFacePusher.Result.Error -> // show error
 * }
 * ```
 */
@Singleton
class WatchFacePusher @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    sealed class Result {
        data class Success(val status: String, val slotId: String?) : Result()
        data class Error(val message: String) : Result()
    }

    companion object {
        /** Timeout for the channel send operation */
        private const val SEND_TIMEOUT_MS = 120_000L

        /**
         * SHA-256 hex digests of the bundled watch face APKs, computed by
         * Gradle from the committed per-buildType assets at build time
         * (see the watch face asset fields in app/build.gradle.kts), so the
         * runtime tamper check is always in lockstep with the bundled APKs.
         */
        internal val VARIANT_SHA256 = mapOf(
            WatchFaceVariant.DIGITAL_FULL to BuildConfig.WATCHFACE_DIGITAL_SHA256,
            WatchFaceVariant.ANALOG_MECHANICAL to BuildConfig.WATCHFACE_ANALOG_SHA256,
        )
    }

    /**
     * Push the bundled watch face APK to the first connected watch node
     * that advertises the [WearDataContract.WATCH_APP_CAPABILITY].
     *
     * Returns [Result.Success] with status "sent" if the channel send completed,
     * or [Result.Error] if no watch is connected or the push fails.
     *
     * Note: "sent" means the bytes were transferred. Actual install status
     * is logged on the watch side. Story 32.4 will add real-time status
     * listening via MessageClient.
     */
    suspend fun pushWatchFace(
        variant: WatchFaceVariant = WatchFaceVariant.DIGITAL_FULL,
    ): Result = withContext(Dispatchers.IO) {
        try {
            val assetName = variant.assetFilename
            if (!hasAsset(assetName)) {
                return@withContext Result.Error("Watch face APK not found: $assetName")
            }

            val expectedHash = VARIANT_SHA256.getValue(variant)
            if (!verifyAssetIntegrity(assetName, expectedHash)) {
                return@withContext Result.Error("Watch face APK integrity check failed")
            }

            val watchNode = findWatchNode()
                ?: return@withContext Result.Error("No watch connected")

            Timber.d(
                "Pushing watch face %s to node: %s (%s)",
                variant.name, watchNode.displayName, watchNode.id,
            )

            val channelClient = Wearable.getChannelClient(context)
            val channel = channelClient.openChannel(
                watchNode.id,
                WearDataContract.WATCHFACE_PUSH_CHANNEL,
            ).await()

            val channelClosed = AtomicBoolean(false)
            try {
                streamApkToChannel(channelClient, channel, channelClosed, assetName)
            } finally {
                closeChannelOnce(channelClient, channel, channelClosed)
            }

            Result.Success(status = "sent", slotId = null)
        } catch (e: Exception) {
            Timber.e(e, "Failed to push watch face")
            Result.Error(e.message ?: "Unknown error")
        }
    }

    private fun hasAsset(name: String): Boolean = try {
        context.assets.open(name).use { true }
    } catch (_: Exception) {
        false
    }

    /**
     * Find a nearby watch node that has the GlycemicGPT watch app installed.
     * Uses CapabilityClient to filter for actual watch nodes rather than
     * picking an arbitrary connected node.
     */
    private suspend fun findWatchNode(): com.google.android.gms.wearable.Node? {
        return try {
            val capInfo = Wearable.getCapabilityClient(context)
                .getCapability(
                    WearDataContract.WATCH_APP_CAPABILITY,
                    CapabilityClient.FILTER_REACHABLE,
                )
                .await()
            capInfo.nodes.firstOrNull { it.isNearby }
                ?: capInfo.nodes.firstOrNull()
        } catch (e: Exception) {
            Timber.w(e, "CapabilityClient lookup failed, falling back to NodeClient")
            val nodes = Wearable.getNodeClient(context).connectedNodes.await()
            nodes.firstOrNull()
        }
    }

    /**
     * Verify the bundled APK asset has not been tampered with by checking
     * its SHA-256 digest against the expected value.
     */
    internal fun verifyAssetIntegrity(
        assetName: String,
        expectedHash: String,
    ): Boolean {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            context.assets.open(assetName).use { input ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            val matches = actualHash == expectedHash
            if (!matches) {
                Timber.e("APK integrity mismatch: expected=%s actual=%s", expectedHash, actualHash)
            }
            matches
        } catch (e: Exception) {
            Timber.e(e, "Failed to verify APK integrity")
            false
        }
    }

    private suspend fun streamApkToChannel(
        channelClient: ChannelClient,
        channel: ChannelClient.Channel,
        channelClosed: AtomicBoolean,
        assetName: String,
    ) = coroutineScope {
        val watchdog = launchSendWatchdog(channelClient, channel, channelClosed)
        try {
            val outputStream = channelClient.getOutputStream(channel).await()
            outputStream.use { output ->
                context.assets.open(assetName).use { input ->
                    copyToOutput(input, output)
                }
            }
            Timber.d("Watch face APK streamed successfully (%s)", assetName)
        } finally {
            watchdog.cancel()
        }
    }

    /** Watchdog that force-closes the channel if the send stalls. */
    private fun kotlinx.coroutines.CoroutineScope.launchSendWatchdog(
        channelClient: ChannelClient,
        channel: ChannelClient.Channel,
        channelClosed: AtomicBoolean,
    ): Job = launch {
        delay(SEND_TIMEOUT_MS)
        Timber.w("Watch face send timed out after %d ms, force-closing channel", SEND_TIMEOUT_MS)
        closeChannelOnce(channelClient, channel, channelClosed)
    }

    /** Closes the channel exactly once, coordinating between watchdog and finally block. */
    private suspend fun closeChannelOnce(
        channelClient: ChannelClient,
        channel: ChannelClient.Channel,
        channelClosed: AtomicBoolean,
    ) {
        if (channelClosed.compareAndSet(false, true)) {
            try {
                channelClient.close(channel).await()
            } catch (e: Exception) {
                Timber.w(e, "Failed to close channel")
            }
        }
    }

    private fun copyToOutput(
        input: java.io.InputStream,
        output: OutputStream,
    ) {
        val buffer = ByteArray(8192)
        var totalBytes = 0L
        var bytesRead: Int
        while (input.read(buffer).also { bytesRead = it } != -1) {
            output.write(buffer, 0, bytesRead)
            totalBytes += bytesRead
        }
        Timber.d("Sent %d bytes to watch", totalBytes)
    }
}
