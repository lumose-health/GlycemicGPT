// Medtronic read-only BLE de-risk spike -- offline SAKE harness.
//
// Self-contained JVM project that consumes OpenMinimed JavaSake from Maven Central
// (GPL-3.0, used with permission -- see LICENSE / README.md) and drives the SAKE
// handshake + SeqCrypt round-trip against OpenMinimed's captured 780G pairing vectors.
// No pump required.
//
// This is a throwaway spike harness, NOT the production :medtronic-pump-driver module.

plugins {
    application
}

group = "com.glycemicgpt.medtronicspike"
version = "0.1.0-spike"

java {
    // Match JavaSake's Java 11 bytecode target.
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

repositories {
    mavenCentral()
}

// Dependency locking: gradle.lockfile gives OSV-Scanner a Gradle manifest to CVE-scan
// (it does not parse build.gradle.kts). Regenerate after dependency changes with:
//   ./gradlew dependencies --write-locks
dependencyLocking {
    lockAllConfigurations()
}

dependencies {
    // OpenMinimed JavaSake: SAKE handshake + SeqCrypt session cipher, formerly vendored
    // under src/{main,test}/java/org/openminimed/sake. Its parity suite (captured 780G
    // trace, PythonSake ciphertexts, NIST vectors) runs in upstream CI at this release.
    implementation("org.openminimed:javasake:0.2.0")

    // JavaSake's only third-party runtime dependency: AES-CMAC (the JDK has no CMAC).
    // Explicit pin to 1.84+ (over JavaSake's transitive 1.79) to clear the HIGH
    // timing-channel advisory (GHSA affecting >= 1.71, < 1.84).
    implementation("org.bouncycastle:bcprov-jdk18on:1.84")

    testImplementation("org.junit.jupiter:junit-jupiter-api:5.11.3")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.11.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.3")
}

application {
    // `./gradlew run` prints the human-readable handshake + cipher report.
    mainClass.set("com.glycemicgpt.medtronicspike.SakeSpikeHarness")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
