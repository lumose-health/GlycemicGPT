package com.glycemicgpt.mobile.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.glycemicgpt.mobile.di.DatabaseModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Verifies the Room 12 -> 13 migration (GLY-130) that adds the `ack_synced` column to `alerts`.
 * Guards two things at once:
 *
 *  1. `runMigrationsAndValidate` re-creates the v12 schema from the exported `12.json`, applies the
 *     real [DatabaseModule.ALL_MIGRATIONS], and asserts the result matches the exported `13.json` --
 *     so a wrong `ALTER TABLE` would fail here, not silently ship (the builder sets
 *     `fallbackToDestructiveMigration`, which would wipe the table).
 *  2. Existing alert rows written at v12 survive the upgrade with the right sync state: an
 *     unacknowledged row is unsynced (nothing to push), while an acknowledged row is backfilled
 *     as synced -- pre-13, `acknowledged` was only ever written after the server confirmed the
 *     ack, so re-POSTing it would be redundant.
 *
 * Instrumented (needs real SQLite): run with `./gradlew :app:connectedDebugAndroidTest`.
 */
@RunWith(AndroidJUnit4::class)
class Migration12To13Test {

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AppDatabase::class.java,
    )

    @Test
    fun migrate12To13_addsAckSyncedColumn_andPreservesExistingRows() {
        // v12: alerts has no `ack_synced` column yet.
        helper.createDatabase(TEST_DB, 12).use { db ->
            db.execSQL(
                "INSERT INTO alerts (server_id, alert_type, severity, message, current_value, " +
                    "acknowledged, timestamp_ms) " +
                    "VALUES ('srv-unacked', 'low_urgent', 'urgent', 'Low glucose', 55.0, 0, 1000)",
            )
            db.execSQL(
                "INSERT INTO alerts (server_id, alert_type, severity, message, current_value, " +
                    "acknowledged, timestamp_ms) " +
                    "VALUES ('srv-acked', 'high_warning', 'warning', 'High glucose', 250.0, 1, 2000)",
            )
        }

        val db = helper.runMigrationsAndValidate(TEST_DB, 13, true, *DatabaseModule.ALL_MIGRATIONS)

        db.query(
            "SELECT server_id, acknowledged, ack_synced FROM alerts ORDER BY timestamp_ms",
        ).use { cursor ->
            assertTrue("unacked row should survive the migration", cursor.moveToFirst())
            assertEquals("srv-unacked", cursor.getString(0))
            assertEquals(0, cursor.getInt(1))
            assertEquals("new column must default to unsynced", 0, cursor.getInt(2))

            assertTrue("acked row should survive the migration", cursor.moveToNext())
            assertEquals("srv-acked", cursor.getString(0))
            assertEquals("local ack state must be preserved", 1, cursor.getInt(1))
            // Pre-13 semantics only ever set acknowledged after a server-confirmed ack, so the
            // backfill marks it synced -- the reconcile must not re-POST pre-migration acks.
            assertEquals("pre-migration ack is server-known, must backfill as synced", 1, cursor.getInt(2))
        }
    }

    private companion object {
        const val TEST_DB = "migration-12-13-test"
    }
}
