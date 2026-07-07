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

/** Unit tests for the SAKE handshake state machine. */
package org.openminimed.sake;
