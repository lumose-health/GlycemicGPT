# medtronic-ble-spike

A re-runnable de-risk spike for the Medtronic MiniMed **read-only** BLE driver. It proves, with
**no physical pump**, the two unknowns that gate the full driver build:

1. **SAKE handshake on the JVM** — OpenMinimed `JavaSake` (Maven Central,
   `org.openminimed:javasake`) completes the 6-stage SAKE
   handshake with the **phone in the BLE-peripheral / SAKE-server role** (`MOBILE_APPLICATION`) and
   the pump in the BLE-central / SAKE-client role (`INSULIN_PUMP`), validated **byte-for-byte
   against OpenMinimed's captured 780G pairing trace**. The derived `SeqCrypt` session cipher
   encrypt/decrypt round-trips and rejects tampering.
2. **Peripheral-mode BLE topology** — a documented capability probe + support matrix for the
   inverted (phone-advertises, pump-connects) model. See [`android-peripheral-probe/`](android-peripheral-probe/).

This is the **offline** half of the de-risk work. The live, pump-gated half (advertising to a real
pump, one live sensor-glucose read) is a separate, hardware-gated follow-up.

> This is a **throwaway spike harness**, not the production driver. The real
> `:medtronic-pump-driver` module consumes the same JavaSake dependency.

## Run it

Requires JDK 17+ — that floor comes from the Gradle 9.1 wrapper, not the code (the sources compile
at Java 11). Maven Central access is needed on first run to fetch JavaSake + BouncyCastle + JUnit.

```sh
cd tools/medtronic-ble-spike

# Spike acceptance gate: phone-as-server handshake vs the captured 780G trace + SeqCrypt
# round-trip, driven through the published JavaSake artifact.
./gradlew test

# Human-readable narration with a PASS/FAIL verdict and a non-zero exit on any failure.
./gradlew run
```

`./gradlew run` prints the handshake stage-by-stage and the SeqCrypt round-trip. Expected tail:

```text
SUMMARY: 16 passed, 0 failed -> ALL CHECKS PASSED
```

## What proves what

| Capability | Proof |
|---|---|
| SAKE handshake vs captured 780G vectors | Upstream `org.openminimed.sake.SakeServerTest` (exact byte-for-byte parity for all 6 messages incl. the SeqCrypt-encrypted msg4, run in [JavaSake CI](https://github.com/OpenMinimed/JavaSake) at the pinned release) + `MedtronicSakeSpikeTest.phoneServerCompletesHandshakeAgainstCaptured780GTrace` + harness section [1] |
| Java port matches PythonSake | Upstream `org.openminimed.sake.SeqCryptTest` (parity vs reference Python ciphertexts), `Aes*Test` (NIST vectors) — JavaSake CI |
| SeqCrypt encrypt→decrypt round-trip + seq handling | Upstream `SeqCryptTest`, `MedtronicSakeSpikeTest.seqCryptRoundTripsAndRejectsTampering`, harness section [3] |
| Peripheral-mode capability | [`android-peripheral-probe/`](android-peripheral-probe/) + support matrix |

Note on the harness narration: `./gradlew run` lives outside the `org.openminimed.sake` package, so
it cannot set the package-private msg4 pad byte that reproduces the capture exactly. It therefore
validates msg0/msg2 bytes + full completion against the real captured pump replies + the live cipher
round-trip, and defers exact msg4 byte-parity to upstream's JUnit suite (which runs in-package). The
emitted msg4's first 16 bytes — the encrypted permit — do match the capture; only the
pad-dependent 4-byte trailer differs, which does not affect handshake completion.

## License / attribution posture

This harness **consumes OpenMinimed `JavaSake` as a Maven Central dependency**
(`org.openminimed:javasake` — it is not a clean-room reimplementation, unlike the Tandem driver).
OpenMinimed is **GPL-3.0** and the author (palmarci / Pál Marci) granted permission to use it;
GlycemicGPT is itself GPL-3.0, so copyleft propagation is a non-issue.

- JavaSake was previously vendored under `src/{main,test}/java/org/openminimed/sake/`; since
  v0.2.0 it is published to Maven Central and Renovate tracks upstream releases.
- `LICENSE` is the GPL-3.0 text as published by OpenMinimed.
- Contributors credited: **palmarci (Pál Marci)** (primary author / RE), **drfubar**,
  **Morten Fyhn Amundsen**, **Stenium**; original `medtronic-bt-decrypt` PoC by **@planiitis**.
  The Android/JVM ports are maintained by **jlengelbrecht**.
- Full project-level attribution (`THIRD_PARTY_LICENSES.md`, acknowledgments) lands with the
  production module, not in this spike.

## Static key DB posture (for the security review)

`org.openminimed.sake.Constants` (in the JavaSake artifact) and `SakeTestVectors` embed
firmware-extracted SAKE key databases and a captured pairing trace. These are **shared SAKE
protocol constants** — the same values live inside every 700-series pump and are used to
authenticate any phone that pairs with it. They are **not session secrets, not unique per device,
and not credentials**. They already ship publicly in
OpenMinimed's GPL-3.0 repository and artifact, so using them introduces no new secret. The synthetic
`CUSTOM_*` databases are generated test keys, not real keys at all. Treat any flag on these values
as a known, published-upstream artifact — not a leak.

## Layout

```text
build.gradle.kts / settings.gradle.kts   self-contained JVM project (application plugin)
src/main/java/com/glycemicgpt/medtronicspike/
    SakeTestVectors.java                  shared OpenMinimed test vectors (capture + matched pair)
    QueuedRngSource.java                  deterministic RNG that replays a captured trace
    SakeSpikeHarness.java                 `./gradlew run` narration with a PASS/FAIL verdict
src/test/java/com/glycemicgpt/medtronicspike/
    MedtronicSakeSpikeTest.java           spike acceptance gate
android-peripheral-probe/                 peripheral-mode capability probe (reference code)
```

JavaSake itself (`org.openminimed.sake.*`, including its parity test suite) lives upstream at
[OpenMinimed/JavaSake](https://github.com/OpenMinimed/JavaSake) and is consumed as
`org.openminimed:javasake` from Maven Central.
