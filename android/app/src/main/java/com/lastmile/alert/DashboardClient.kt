package com.lastmile.alert

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class DashboardClient {
    data class Station(
        val name: String,
        val river: String,
        val waterLevel: String
    )

    data class Alert(
        val title: String,
        val priority: String,
        val status: String
    )

    data class Evaluation(
        val riskLevel: String,
        val score: String
    )

    data class Summary(
        val stations: List<Station>,
        val alerts: List<Alert>,
        val evaluations: List<Evaluation>
    )

    fun loadSummary(onResult: (Result<Summary>) -> Unit) {
        Thread {
            val result = runCatching {
                val baseUrl = BuildConfig.SUPABASE_URL.trim().trimEnd('/')
                val headers = mapOf(
                    "apikey" to BuildConfig.SUPABASE_ANON_KEY,
                    "Authorization" to "Bearer ${BuildConfig.SUPABASE_ANON_KEY}"
                )
                val stationsJson = getJson("$baseUrl/rest/v1/hydro_stations?select=id,station_name,river_name,station_code&station_code=in.(CWC_MELLI,CWC_NANGLAMORAGHAT)", headers)
                val readingsJson = getJson("$baseUrl/rest/v1/hydro_readings?select=station_id,water_level_m,observed_at&order=observed_at.desc&limit=20", headers)
                val alertsJson = getJson("$baseUrl/rest/v1/alerts?select=title,priority,status&status=in.(pending_approval,approved,dispatching,active)&order=created_at.desc&limit=20", headers)
                val evaluationsJson = getJson("$baseUrl/rest/v1/rule_evaluations?select=risk_level,total_score&order=evaluated_at.desc&limit=20", headers)

                val readingByStation = mutableMapOf<String, String>()
                for (index in 0 until readingsJson.length()) {
                    val item = readingsJson.optJSONObject(index) ?: continue
                    val stationId = item.optString("station_id")
                    if (stationId !in readingByStation) readingByStation[stationId] = item.optString("water_level_m", "n/a")
                }
                Summary(
                    stations = buildList {
                        for (index in 0 until stationsJson.length()) {
                            val item = stationsJson.optJSONObject(index) ?: continue
                            add(Station(item.optString("station_name", "Unknown station"), item.optString("river_name", "Unknown river"), readingByStation[item.optString("id")] ?: "n/a"))
                        }
                    },
                    alerts = buildList {
                        for (index in 0 until alertsJson.length()) {
                            val item = alertsJson.optJSONObject(index) ?: continue
                            add(Alert(item.optString("title", "Untitled alert"), item.optString("priority", "P3"), item.optString("status", "unknown")))
                        }
                    },
                    evaluations = buildList {
                        for (index in 0 until evaluationsJson.length()) {
                            val item = evaluationsJson.optJSONObject(index) ?: continue
                            add(Evaluation(item.optString("risk_level", "watch"), item.optString("total_score", "n/a")))
                        }
                    }
                )
            }
            onResult(result)
        }.start()
    }

    private fun getJson(url: String, headers: Map<String, String>): org.json.JSONArray {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 10_000
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }
        try {
            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (responseCode !in 200..299) error("Supabase returned HTTP $responseCode: ${responseBody.take(180)}")
            return org.json.JSONArray(responseBody)
        } finally {
            connection.disconnect()
        }
    }
}