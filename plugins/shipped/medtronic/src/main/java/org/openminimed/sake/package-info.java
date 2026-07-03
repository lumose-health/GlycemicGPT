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
 * Only this attribution header was added; the file is otherwise byte-identical
 * to the pinned upstream commit (test sources under this module are adapted to
 * JUnit 4; see their headers). Re-vendor from upstream rather than editing here.
 */

/**
 * Java port of the SAKE handshake protocol used by 700-series Medtronic pumps.
 *
 * <p>This package mirrors the public surface of the reference Python implementation at <a
 * href="https://github.com/OpenMinimed/PythonSake">PythonSake</a>.
 */
package org.openminimed.sake;
