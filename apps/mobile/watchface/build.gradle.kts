import java.security.MessageDigest
import java.util.zip.ZipFile

plugins {
    alias(libs.plugins.android.application)
}

android {
    // Watch Face Push API requires: <client-app-package>.watchfacepush.<identifier>
    // Client = wear-device module (com.glycemicgpt.mobile[.debug])
    namespace = "com.glycemicgpt.mobile.watchfacepush.glycemicgpt"
    compileSdk = 35

    defaultConfig {
        // Release: client = com.glycemicgpt.mobile
        applicationId = "com.glycemicgpt.mobile.watchfacepush.glycemicgpt"
        minSdk = 33
        targetSdk = 35

        val appVersionName = "0.11.0" // x-release-please-version
        val parts = appVersionName.split(".")
        val major = parts.getOrElse(0) { "0" }.toInt()
        val minor = parts.getOrElse(1) { "0" }.toInt()
        val patch = parts.getOrElse(2) { "0" }.toInt()

        versionCode = major * 1_000_000 + minor * 10_000 + patch
        versionName = appVersionName
    }

    // Flavor-specific applicationIds are set in the androidComponents.onVariants block below.
    flavorDimensions += "style"
    productFlavors {
        create("digitalFull") { dimension = "style" }
        create("analogMechanical") { dimension = "style" }
    }

    signingConfigs {
        val debugKsFile = System.getenv("DEBUG_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }
        if (debugKsFile != null) {
            getByName("debug") {
                storeFile = file(debugKsFile)
                storePassword = requireNotNull(
                    System.getenv("DEBUG_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() },
                ) {
                    "DEBUG_KEYSTORE_PASSWORD must be set when DEBUG_KEYSTORE_FILE is provided"
                }
                keyAlias = requireNotNull(
                    System.getenv("DEBUG_KEY_ALIAS")?.takeIf { it.isNotBlank() },
                ) {
                    "DEBUG_KEY_ALIAS must be set when DEBUG_KEYSTORE_FILE is provided"
                }
                keyPassword = requireNotNull(
                    System.getenv("DEBUG_KEY_PASSWORD")?.takeIf { it.isNotBlank() },
                ) {
                    "DEBUG_KEY_PASSWORD must be set when DEBUG_KEYSTORE_FILE is provided"
                }
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            // Watch face release APKs use the same signing config as debug for now.
            // A dedicated release keystore will be added when production distribution
            // is set up. The Watch Face Push API does not enforce Play Store signing.
            signingConfig = signingConfigs.getByName("debug")
            // Keep release APK structure identical to the hardware-verified debug
            // shape: no VCS metadata baked into the committed asset.
            vcsInfo {
                include = false
            }
        }
    }

    // WFF is resource-only: exclude AGP build metadata from merged resources.
    // NOTE: Do NOT exclude META-INF signing files (MANIFEST.MF, CERT.SF, CERT.RSA)
    // as the DwfValidator requires a signed APK.
    packaging {
        resources {
            excludes += "/*.properties"
            excludes += "/*.version"
        }
    }
}

// No dependencies: WFF is a resource-only APK (hasCode=false)

// Generates res/raw/watchface.xml for a variant from the flavor's template
// (src/<flavor>/templates/watchface.xml), substituting the @WEAR_PKG@ token
// with the wear-device application id for the target buildType. WFF XML has
// no build-time variable substitution of its own, and a hardcoded provider
// package would leave release faces pointing complications at the debug wear
// app (dead slots on a fresh production install).
@CacheableTask
abstract class GenerateWatchFaceXmlTask : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val template: RegularFileProperty

    @get:Input
    abstract val wearPackage: Property<String>

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun generate() {
        val templateText = template.get().asFile.readText()
        if (!templateText.contains(WEAR_PKG_TOKEN)) {
            throw GradleException(
                "${template.get().asFile} contains no $WEAR_PKG_TOKEN token; " +
                    "complication providers would not track the buildType",
            )
        }
        val outFile = outputDir.get().asFile.resolve("raw/watchface.xml")
        outFile.parentFile.mkdirs()
        outFile.writeText(templateText.replace(WEAR_PKG_TOKEN, wearPackage.get()))
    }

    companion object {
        const val WEAR_PKG_TOKEN = "@WEAR_PKG@"
    }
}

// Set applicationId per variant to match the Watch Face Push API requirement:
// <wear-device-package>.watchfacepush.<name>
// Debug wear-device = com.glycemicgpt.mobile.debug -> debug prefix
// Release wear-device = com.glycemicgpt.mobile -> release prefix
// Flavor suffix appended to differentiate face variants.
androidComponents {
    onVariants { variant ->
        val flavorSuffix = variant.productFlavors
            .firstOrNull { it.first == "style" }
            ?.second?.let { flavor ->
                when (flavor) {
                    "digitalFull" -> ""
                    "analogMechanical" -> "_mechanical"
                    else -> "" // Defensive fallback for future flavors
                }
            } ?: ""
        val basePrefix = if (variant.buildType == "debug") {
            "com.glycemicgpt.mobile.debug.watchfacepush.glycemicgpt"
        } else {
            "com.glycemicgpt.mobile.watchfacepush.glycemicgpt"
        }
        variant.applicationId.set("$basePrefix$flavorSuffix")

        // Emit the per-buildType watchface.xml into this variant's generated res.
        val flavorName = variant.productFlavors
            .firstOrNull { it.first == "style" }
            ?.second
        if (flavorName != null) {
            val wearDevicePackage = if (variant.buildType == "debug") {
                "com.glycemicgpt.mobile.debug"
            } else {
                "com.glycemicgpt.mobile"
            }
            val generateXml = project.tasks.register<GenerateWatchFaceXmlTask>(
                "generate${variant.name.replaceFirstChar { it.uppercase() }}WatchFaceXml",
            ) {
                template.set(
                    layout.projectDirectory.file("src/$flavorName/templates/watchface.xml"),
                )
                wearPackage.set(wearDevicePackage)
            }
            variant.sources.res?.addGeneratedSourceDirectory(
                generateXml,
                GenerateWatchFaceXmlTask::outputDir,
            )
        }
    }
}

// Post-build: strip classes.dex and re-sign with v1+v2 signing.
//
// Why this is needed:
//   1. AGP always generates classes.dex even with hasCode=false.
//      The DwfValidator rejects APKs containing classes.dex.
//   2. With minSdk >= 24, AGP uses only v2/v3 signing (no META-INF entries).
//      The DwfValidator requires v1 JAR signing (META-INF/MANIFEST.MF).
//   3. targetSdk 35 requires v2 signing minimum.
//   4. Stripping classes.dex invalidates any existing signature.
//
// Solution: strip classes.dex, zipalign, then re-sign with apksigner (v1+v2).

/** Resolve an Android SDK build-tools binary, checking ANDROID_HOME/build-tools first. */
fun findBuildTool(name: String): String {
    // Try ANDROID_HOME build-tools directories (sorted descending to pick latest version)
    val androidHome = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    if (androidHome != null) {
        val buildToolsDir = File(androidHome, "build-tools")
        if (buildToolsDir.isDirectory) {
            val versions = buildToolsDir.listFiles()
                ?.filter { it.isDirectory }
                ?.sortedDescending()
                ?: emptyList()
            for (version in versions) {
                val tool = File(version, name)
                if (tool.exists() && tool.canExecute()) return tool.absolutePath
            }
        }
    }
    // Fall back to PATH
    return name
}

android.applicationVariants.all {
    val variant = this
    val stripTask = tasks.register("strip${variant.name.replaceFirstChar { it.uppercase() }}WffFiles") {
        description = "Strip classes.dex from WFF APK, zipalign, and re-sign with v1+v2"
        dependsOn(variant.assembleProvider)
        doLast {
            val apkDir = variant.outputs.first().outputFile.parentFile
            apkDir.listFiles()?.filter { it.extension == "apk" }?.forEach { apk ->
                // 1. Strip classes.dex and AGP build metadata.
                //    zip -d returns exit code 12 when entries don't exist (normal for
                //    incremental builds). Other non-zero codes indicate real errors.
                val zipResult = exec {
                    commandLine("zip", "-d", apk.absolutePath, "classes.dex",
                        "META-INF/com/android/build/gradle/app-metadata.properties")
                    isIgnoreExitValue = true
                }
                // 0 = success, 12 = "nothing to do" (entries already absent)
                if (zipResult.exitValue != 0 && zipResult.exitValue != 12) {
                    throw GradleException("zip -d failed with exit code ${zipResult.exitValue}")
                }

                // 2. Zipalign: ensure resources.arsc is 4-byte aligned.
                //    Required for Android R+ (API 30+). Must happen BEFORE signing
                //    because apksigner expects an aligned APK.
                val zipalignBin = findBuildTool("zipalign")
                val aligned = File(apk.parentFile, "aligned-${apk.name}")
                exec {
                    commandLine(zipalignBin, "-f", "4", apk.absolutePath, aligned.absolutePath)
                }
                if (!aligned.renameTo(apk)) {
                    // Fallback for cross-filesystem moves (e.g., Docker, NFS)
                    aligned.copyTo(apk, overwrite = true)
                    aligned.delete()
                }

                // 3. Re-sign with apksigner (v1+v2) using debug keystore.
                //    Default passwords are the well-known Android SDK debug keystore
                //    defaults (publicly documented, auto-generated by Android Studio).
                val apksignerBin = findBuildTool("apksigner")
                val envKs = System.getenv("DEBUG_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }
                val ksFile = if (envKs != null) file(envKs) else
                    File(System.getProperty("user.home"), ".android/debug.keystore")
                val ksPass = System.getenv("DEBUG_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() } ?: "android"
                val keyAlias = System.getenv("DEBUG_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "androiddebugkey"
                val keyPass = System.getenv("DEBUG_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: "android"

                if (!ksFile.exists()) {
                    // CI runners may not have a debug keystore. The WFF APK
                    // shipped in app assets is pre-signed locally; CI only
                    // needs the build to succeed, not a valid signed WFF APK.
                    logger.warn("Keystore not found at ${ksFile.absolutePath}; skipping re-sign (WFF APK will be unsigned)")
                } else {
                    exec {
                        commandLine(
                            apksignerBin, "sign",
                            "--ks", ksFile.absolutePath,
                            "--ks-pass", "pass:$ksPass",
                            "--ks-key-alias", keyAlias,
                            "--key-pass", "pass:$keyPass",
                            "--v1-signing-enabled", "true",
                            "--v2-signing-enabled", "true",
                            apk.absolutePath,
                        )
                    }
                    logger.lifecycle("Stripped classes.dex, zipaligned, and re-signed ${apk.name} with v1+v2 signing")
                }
            }
        }
    }
    variant.assembleProvider.get().finalizedBy(stripTask)
}

// The four flavor x buildType watch face APKs committed into the phone app's
// per-buildType asset source sets. Android merges src/<buildType>/assets over
// src/main, so each phone build bundles the face whose complication provider
// packages match its own wear-device package -- no app-code branching.
data class CommittedWatchFaceAsset(val flavor: String, val buildType: String) {
    val variantName = "$flavor${buildType.replaceFirstChar { it.uppercase() }}"
    val builtApkPath = "outputs/apk/$flavor/$buildType/watchface-$flavor-$buildType.apk"
    val appAssetPath = "app/src/$buildType/assets/glycemicgpt-watchface-$flavor.apk"
}

val committedWatchFaceAssets = listOf(
    CommittedWatchFaceAsset("digitalFull", "debug"),
    CommittedWatchFaceAsset("digitalFull", "release"),
    CommittedWatchFaceAsset("analogMechanical", "debug"),
    CommittedWatchFaceAsset("analogMechanical", "release"),
)

// Rebuilds all four watch face APKs and copies them over the committed assets
// in app/src/{debug,release}/assets. Run this whenever the templates, watch
// face resources, or this build script change, then commit the updated APKs.
// The JVM drift gate in :app (WatchFacePusherTest) fails CI if the committed
// assets do not match the templates, so a forgotten regen cannot ship.
tasks.register("updateAppWatchFaceAssets") {
    description = "Rebuild all watch face variants and copy the stripped, re-signed " +
        "APKs into app/src/<buildType>/assets"
    dependsOn(
        committedWatchFaceAssets.map { asset ->
            "strip${asset.variantName.replaceFirstChar { it.uppercase() }}WffFiles"
        },
    )

    doLast {
        committedWatchFaceAssets.forEach { asset ->
            val builtApk = layout.buildDirectory.file(asset.builtApkPath).get().asFile
            if (!builtApk.isFile) {
                throw GradleException("Expected watch face APK not found: $builtApk")
            }
            ZipFile(builtApk).use { zip ->
                if (zip.getEntry("res/raw/watchface.xml") == null) {
                    throw GradleException(
                        "$builtApk has no res/raw/watchface.xml entry; refusing to " +
                            "commit an asset the drift gate cannot verify",
                    )
                }
            }
            val destination = rootProject.file(asset.appAssetPath)
            destination.parentFile.mkdirs()
            builtApk.copyTo(destination, overwrite = true)
            logger.lifecycle("Updated ${asset.appAssetPath}")
        }

        // Checksum manifest pinning the full bytes of every committed asset.
        // The drift gate (WatchFacePusherTest) verifies assets against this
        // file, so any asset change that bypasses this task -- a hand-edited
        // APK, a manual copy, a partial update -- fails CI. Only this task
        // updates it; never edit it by hand.
        val manifest = layout.projectDirectory.file("committed-assets.sha256").asFile
        manifest.writeText(
            committedWatchFaceAssets.joinToString("") { asset ->
                val bytes = rootProject.file(asset.appAssetPath).readBytes()
                val hex = MessageDigest.getInstance("SHA-256").digest(bytes)
                    .joinToString("") { "%02x".format(it) }
                "$hex  ${asset.appAssetPath}\n"
            },
        )
        logger.lifecycle("Updated watchface/committed-assets.sha256")
    }
}

// Fail fast -- before the four-variant assemble/strip/re-sign -- when
// updateAppWatchFaceAssets is requested without the required flag. Release
// builds shorten resource paths by default (res/raw/watchface.xml becomes
// res/<xx>.xml), which would diverge from the hardware-verified debug APK
// structure and hide the entry the drift gate reads. The per-APK check in
// doLast above is the backstop.
gradle.taskGraph.whenReady {
    if (hasTask("${project.path}:updateAppWatchFaceAssets") &&
        project.findProperty("android.enableResourceOptimizations") != "false"
    ) {
        throw GradleException(
            "updateAppWatchFaceAssets requires resource-path optimization to be " +
                "disabled so committed assets keep their res/raw/watchface.xml " +
                "entry. Run:\n  ./gradlew -Pandroid.enableResourceOptimizations=false " +
                ":watchface:updateAppWatchFaceAssets",
        )
    }
}
