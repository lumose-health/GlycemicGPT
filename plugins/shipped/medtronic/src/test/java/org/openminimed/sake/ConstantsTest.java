/*
 * Vendored from OpenMinimed JavaSake (https://github.com/OpenMinimed/JavaSake)
 * at commit d78ff25 -- verbatim except for this header (verified byte-identical).
 *
 * Copyright (C) OpenMinimed contributors: palmarci (Pal Marci), drfubar,
 * Morten Fyhn Amundsen, Stenium. Original medtronic-bt-decrypt PoC by @planiitis.
 * Android/JVM port maintained by jlengelbrecht.
 *
 * This file is part of GlycemicGPT and is redistributed under the GNU General
 * Public License v3.0, the license under which OpenMinimed makes it available
 * and under which GlycemicGPT itself is released. Used with the author's
 * permission. See tools/medtronic-ble-spike/LICENSE and README.md.
 *
 * This test source was adapted from the pinned upstream commit for this
 * Android module (JUnit 5 -> JUnit 4); test coverage is otherwise unchanged.
 * Re-vendor from upstream and re-apply the adaptation if it drifts.
 */

package org.openminimed.sake;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ConstantsTest {

    @Test
    public void g4CgmLocalIsPrimaryDisplay() {
        assertEquals(DeviceType.PRIMARY_DISPLAY, Constants.KEYDB_G4_CGM.localDeviceType());
        assertNotNull(Constants.KEYDB_G4_CGM.remoteDevices().get(DeviceType.GLUCOSE_SENSOR));
    }

    @Test
    public void pumpExtractedLocalIsMobileApplication() {
        assertEquals(
                DeviceType.MOBILE_APPLICATION, Constants.KEYDB_PUMP_EXTRACTED.localDeviceType());
        assertNotNull(Constants.KEYDB_PUMP_EXTRACTED.remoteDevices().get(DeviceType.INSULIN_PUMP));
    }

    @Test
    public void pumpHardcodedLocalIsMobileApplication() {
        assertEquals(
                DeviceType.MOBILE_APPLICATION, Constants.KEYDB_PUMP_HARDCODED.localDeviceType());
        assertNotNull(Constants.KEYDB_PUMP_HARDCODED.remoteDevices().get(DeviceType.INSULIN_PUMP));
    }

    @Test
    public void availableKeysExposesAllThreeDatabases() {
        assertEquals(3, Constants.AVAILABLE_KEYS.size());
        assertTrue(Constants.AVAILABLE_KEYS.contains(Constants.KEYDB_G4_CGM));
        assertTrue(Constants.AVAILABLE_KEYS.contains(Constants.KEYDB_PUMP_EXTRACTED));
        assertTrue(Constants.AVAILABLE_KEYS.contains(Constants.KEYDB_PUMP_HARDCODED));
    }
}
