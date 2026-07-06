package com.glycemicgpt.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.glycemicgpt.mobile.data.local.entity.SyncQueueEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncDao {

    @Insert
    suspend fun enqueue(entity: SyncQueueEntity)

    /** Insert a batch in one transaction -- all rows land or none do. */
    @Insert
    suspend fun enqueueAll(entities: List<SyncQueueEntity>)

    @Query(
        """
        SELECT * FROM sync_queue
        WHERE status = 'pending'
           OR (status = 'failed' AND retryCount < :maxRetries
               AND lastAttemptMs < :nowMs - (2000 * (1 << retryCount)))
        ORDER BY createdAtMs ASC
        LIMIT :limit
        """
    )
    suspend fun getPendingBatch(
        limit: Int = 50,
        maxRetries: Int = 5,
        nowMs: Long = System.currentTimeMillis(),
    ): List<SyncQueueEntity>

    @Query("UPDATE sync_queue SET status = 'sending', lastAttemptMs = :nowMs WHERE id IN (:ids)")
    suspend fun markSending(ids: List<Long>, nowMs: Long = System.currentTimeMillis())

    @Query("DELETE FROM sync_queue WHERE id IN (:ids)")
    suspend fun deleteSent(ids: List<Long>)

    @Query(
        """
        UPDATE sync_queue
        SET status = 'failed', retryCount = retryCount + 1, lastAttemptMs = :nowMs, errorMessage = :error
        WHERE id IN (:ids)
        """
    )
    suspend fun markFailed(
        ids: List<Long>,
        error: String?,
        nowMs: Long = System.currentTimeMillis(),
    )

    /**
     * Mark a batch failed WITHOUT counting toward the retry budget: transport failures
     * (the server never received the batch) and transient server responses (5xx/429/408).
     * These must not exhaust MAX_RETRIES -- a backend outage longer than the retry budget
     * (~62s) would otherwise silently discard the whole queue instead of draining it on
     * reconnect. Setting status='failed' (rather than leaving the rows in 'sending')
     * keeps them re-selectable by [getPendingBatch] on their current backoff tier instead
     * of stalling 60s per cycle waiting for [resetStaleSending].
     */
    @Query(
        """
        UPDATE sync_queue
        SET status = 'failed', lastAttemptMs = :nowMs, errorMessage = :error
        WHERE id IN (:ids)
        """
    )
    suspend fun markTransientFailure(
        ids: List<Long>,
        error: String?,
        nowMs: Long = System.currentTimeMillis(),
    )

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status != 'sending'")
    fun observePendingCount(): Flow<Int>

    /** Count all items in the sync queue (all statuses, for queue size bounds). */
    @Query("SELECT COUNT(*) FROM sync_queue")
    suspend fun countAll(): Int

    /**
     * Delete the oldest items to keep the queue bounded, preserving only in-flight 'sending'
     * rows. During an outage the backlog dwells in 'failed' below MAX_RETRIES (transport
     * failures no longer count toward the budget), so limiting the prune to pending/exhausted
     * rows would starve it and let the queue grow past the cap -- dropping the oldest
     * retryable rows IS the intended discard policy at MAX_QUEUE_SIZE.
     */
    @Query(
        """
        DELETE FROM sync_queue
        WHERE id IN (
            SELECT id FROM sync_queue
            WHERE status != 'sending'
            ORDER BY createdAtMs ASC
            LIMIT :excess
        )
        """
    )
    suspend fun pruneOldest(excess: Int)

    /** Delete items that have exceeded max retries or are older than the given cutoff. */
    @Query("DELETE FROM sync_queue WHERE retryCount >= :maxRetries OR createdAtMs < :cutoffMs")
    suspend fun cleanup(maxRetries: Int = 5, cutoffMs: Long)

    /** Reset orphaned 'sending' items back to 'pending' (e.g. after crash/restart). */
    @Query("UPDATE sync_queue SET status = 'pending' WHERE status = 'sending' AND lastAttemptMs < :staleCutoffMs")
    suspend fun resetStaleSending(staleCutoffMs: Long)

    /**
     * Purge the entire queue. Stand-down path only: with no backend configured every row is
     * undeliverable, regardless of status. Returns the number of rows removed.
     */
    @Query("DELETE FROM sync_queue")
    suspend fun deleteAll(): Int
}
