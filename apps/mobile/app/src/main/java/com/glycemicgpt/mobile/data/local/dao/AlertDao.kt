package com.glycemicgpt.mobile.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AlertDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(alert: AlertEntity): Long

    /**
     * REPLACE-insert that never downgrades a locally-acknowledged row (GLY-130 clobber guard).
     *
     * `acknowledged` is local/user-intent truth: when the server echo still says
     * `acknowledged=false` (the ack POST hasn't landed yet) but the local row is already
     * acknowledged, the local ack state is preserved — otherwise an SSE re-delivery or a pull
     * would reset the row to unacknowledged and the alert would re-fire.
     *
     * Returns the entity actually persisted so callers can branch on the merged ack state.
     */
    @Transaction
    suspend fun insertPreservingLocalAck(alert: AlertEntity): AlertEntity {
        val existing = getByServerId(alert.serverId)
        val merged = if (existing != null && existing.acknowledged && !alert.acknowledged) {
            alert.copy(acknowledged = true, ackSynced = existing.ackSynced)
        } else {
            alert
        }
        insert(merged)
        return merged
    }

    @Query("SELECT * FROM alerts WHERE server_id = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: String): AlertEntity?

    @Query("SELECT * FROM alerts ORDER BY timestamp_ms DESC LIMIT 100")
    fun observeRecentAlerts(): Flow<List<AlertEntity>>

    /** Mark the alert acknowledged locally with the server ack still pending. Runs
     *  unconditionally at ack time — local silence must never wait on the network. */
    @Query("UPDATE alerts SET acknowledged = 1, ack_synced = 0 WHERE server_id = :serverId")
    suspend fun markAcknowledgedPending(serverId: String)

    /** Record that the server accepted (or terminally rejected) the acknowledgement. */
    @Query("UPDATE alerts SET ack_synced = 1 WHERE server_id = :serverId")
    suspend fun markAckSynced(serverId: String)

    /** Acknowledgements made locally that still need to reach the server, oldest first. */
    @Query(
        "SELECT server_id FROM alerts " +
            "WHERE acknowledged = 1 AND ack_synced = 0 " +
            "ORDER BY timestamp_ms ASC, id ASC",
    )
    suspend fun getPendingAckServerIds(): List<String>

    @Query(
        "SELECT server_id FROM alerts " +
            "WHERE acknowledged = 0 " +
            "ORDER BY timestamp_ms DESC, id DESC " +
            "LIMIT 1",
    )
    suspend fun getLatestUnacknowledgedServerId(): String?

    @Query("DELETE FROM alerts WHERE timestamp_ms < :cutoffMs")
    suspend fun deleteOlderThan(cutoffMs: Long)

    @Query("DELETE FROM alerts")
    suspend fun deleteAll()
}
