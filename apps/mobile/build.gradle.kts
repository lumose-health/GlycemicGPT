// Top-level build file for GlycemicGPT Android app
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.ksp) apply false
}

// Dependency locking: every module commits a gradle.lockfile so OSV-Scanner has a Gradle
// manifest to CVE-scan -- it does not parse build.gradle.kts or libs.versions.toml (see
// docs/dev/security-testing.md). On Renovate PRs the regen-gradle-lockfiles.yml workflow
// refreshes the lockfiles (Renovate's own container lacks the Android SDK and cannot).
// After changing dependencies manually, regenerate with:
//   ./gradlew resolveAndLockAll --write-locks
allprojects {
    dependencyLocking {
        lockAllConfigurations()
    }

    // Do not lock two narrow configuration families (everything else, including other
    // AGP-generated configurations such as _agp_internal_*, stays locked and scanned):
    //  - "_internal-unified-test-platform-*" is AGP's bundled instrumented-test host tooling
    //    (netty, protobuf, ...). Its versions are pinned by AGP itself, never ship in an APK,
    //    and can only move via an AGP bump -- locking them would put AGP's internal supply
    //    chain on our CVE gate with findings we cannot fix.
    //  - "*DependenciesMetadata" configurations are Kotlin compile-metadata views, not real
    //    classpaths; they bypass the conflict resolution the actual classpaths perform.
    fun excludedFromLocking(configurationName: String) =
        configurationName.startsWith("_internal-unified-test-platform") ||
            configurationName.endsWith("DependenciesMetadata")

    configurations.configureEach {
        if (excludedFromLocking(name)) {
            resolutionStrategy.deactivateDependencyLocking()
        }
    }

    tasks.register("resolveAndLockAll") {
        notCompatibleWithConfigurationCache("Filters configurations at execution time")
        doFirst {
            require(gradle.startParameter.isWriteDependencyLocks) {
                "$path must be run with the --write-locks flag"
            }
        }
        doLast {
            configurations.filter { it.isCanBeResolved }.forEach {
                try {
                    // Resolve the dependency graph only (not artifacts): lock state is
                    // written from the graph, and artifact-variant selection fails for a
                    // few AGP configurations outside their task context (e.g. the app's
                    // own androidTest compile classpath).
                    it.incoming.resolutionResult.root
                } catch (e: Exception) {
                    // The configurations excluded from locking above are AGP-internal and may
                    // not resolve outside their task context; that is expected. Any other
                    // resolution failure would mean an incomplete lockfile -- fail loudly.
                    if (excludedFromLocking(it.name)) {
                        logger.warn("Skipping unresolvable configuration ${it.name}: ${e.message}")
                    } else {
                        throw e
                    }
                }
            }
        }
    }
}
