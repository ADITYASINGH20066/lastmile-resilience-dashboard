plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}

// Keep generated Android files outside the OneDrive workspace to avoid file locks.
val externalBuildRoot = file("C:/lastmile-android-build")
layout.buildDirectory.set(externalBuildRoot)

subprojects {
    layout.buildDirectory.set(externalBuildRoot.resolve(project.name))
}
