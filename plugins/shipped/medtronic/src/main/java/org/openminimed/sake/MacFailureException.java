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

package org.openminimed.sake;

/** Thrown when a CMAC trailer does not match the computed value during decryption. */
public class MacFailureException extends Exception {

    private static final long serialVersionUID = 1L;

    public MacFailureException(String message) {
        super(message);
    }
}
