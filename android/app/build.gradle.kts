import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { input -> load(input) }
}

android {
    namespace = "com.lastmile.alert"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    defaultConfig {
        applicationId = "com.lastmile.alert"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
        val supabaseUrl = localProperties.getProperty("supabaseUrl", "")
        val supabaseAnonKey = localProperties.getProperty("supabaseAnonKey", "")
        val dashboardApiUrl = localProperties.getProperty(
            "dashboardApiUrl",
            "https://lastmile-resilience-dashboard.onrender.com/api"
        )
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "DASHBOARD_API_URL", "\"$dashboardApiUrl\"")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.gms:play-services-nearby:19.3.0")
}
