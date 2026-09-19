package com.lastmile.alert

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.graphics.Color
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import java.nio.charset.StandardCharsets
import java.util.UUID

class MainActivity : AppCompatActivity() {
    private lateinit var connections: ConnectionsClient
    private lateinit var statusText: TextView
    private lateinit var alertsText: TextView
    private lateinit var dashboardUrlInput: EditText
    private lateinit var dashboardStatusText: TextView
    private lateinit var roleText: TextView
    private lateinit var workspaceText: TextView
    private lateinit var roleContent: LinearLayout
    private lateinit var emergencyStore: EmergencyStore
    private lateinit var dashboardClient: DashboardClient
    private var dashboardSummary: DashboardClient.Summary? = null
    private val connectedEndpoints = mutableSetOf<String>()
    private val endpointNames = mutableMapOf<String, String>()
    private val receivedAlertIds = mutableSetOf<String>()
    private val strategy = Strategy.P2P_CLUSTER
    private val serviceId = "com.lastmile.alert.RELAY"
    private val notificationChannel = "lastmile-alerts"
    private var relayStarted = false
    private val defaultChainHops = 106
    private lateinit var session: SessionStore.Session

    private val lifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: com.google.android.gms.nearby.connection.ConnectionInfo) {
            endpointNames[endpointId] = info.endpointName
            connections.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                connectedEndpoints.add(endpointId)
                updateStatus("Relay active / ${connectedEndpoints.size} nearby node(s)")
            }
        }

        override fun onDisconnected(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            endpointNames.remove(endpointId)
            updateStatus("Relay active / ${connectedEndpoints.size} nearby node(s)")
        }
    }

    private val discoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            connections.requestConnection(deviceName(), endpointId, lifecycleCallback)
        }

        override fun onEndpointLost(endpointId: String) = Unit
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val message = payload.asBytes()?.toString(StandardCharsets.UTF_8) ?: return
            receiveAndRelay(message, endpointId)
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        emergencyStore = EmergencyStore(this)
        dashboardClient = DashboardClient()
        session = SessionStore.Session("demo", "Demo Operator", "control_room")
        connections = Nearby.getConnectionsClient(this)
        statusText = findViewById(R.id.statusText)
        alertsText = findViewById(R.id.alertsText)
        dashboardUrlInput = findViewById(R.id.dashboardUrlInput)
        dashboardUrlInput.setText(BuildConfig.SUPABASE_URL)
        dashboardStatusText = findViewById(R.id.dashboardStatusText)
        roleText = findViewById(R.id.roleText)
        workspaceText = findViewById(R.id.workspaceText)
        findViewById<TextView>(R.id.userText).text = "${session.displayName} / ${session.username}"
        roleText.text = session.role.replace('_', ' ').uppercase()
        workspaceText.text = workspaceFor(session.role)
        roleContent = findViewById(R.id.roleContent)
        renderRoleWorkspace(session)
        createNotificationChannel()

        val roles = listOf(
            "control_room" to "Control room",
            "disaster_authority" to "Disaster authority",
            "village_authority" to "Village authority",
            "community_member" to "Community member",
            "admin" to "System admin"
        )
        val roleSelector = findViewById<Spinner>(R.id.roleSelector)
        roleSelector.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            roles.map { it.second }
        )
        roleSelector.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val selectedRole = roles[position].first
                if (selectedRole == session.role) return
                session = session.copy(role = selectedRole)
                roleText.text = selectedRole.replace('_', ' ').uppercase()
                workspaceText.text = workspaceFor(selectedRole)
                renderRoleWorkspace(session)
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        findViewById<Button>(R.id.relayButton).setOnClickListener { requestPermissionsAndStart() }
        findViewById<Button>(R.id.sendButton).setOnClickListener { sendDemoAlert() }
        findViewById<Button>(R.id.dashboardButton).setOnClickListener { connectToDashboard() }
        connectToDashboard()
    }

    private fun workspaceFor(role: String): String = when (role) {
        "control_room" -> "Operational command / alert approval / network twin"
        "disaster_authority" -> "Regional situation / approval queue / delivery oversight"
        "village_authority" -> "Japisagiya Gaon / local warning / community reporting"
        "community_member" -> "Emergency information / active warnings / acknowledgement"
        else -> "System administration / account oversight / relay health"
    }

    private fun connectToDashboard() {
        val button = findViewById<Button>(R.id.dashboardButton)
        button.isEnabled = false
        dashboardStatusText.text = "Supabase: connecting..."
        dashboardClient.loadSummary { result ->
            runOnUiThread {
                button.isEnabled = true
                result.onSuccess { summary ->
                    dashboardSummary = summary
                    dashboardStatusText.text = if (summary.stations.isEmpty() && summary.alerts.isEmpty() && summary.evaluations.isEmpty()) {
                        "Supabase: connected, but anon key can see no rows / check RLS policies"
                    } else {
                        "Supabase: connected / ${summary.stations.size} stations / ${summary.alerts.size} alerts"
                    }
                    renderRoleWorkspace(session)
                }.onFailure { error ->
                    dashboardStatusText.text = "Supabase: connection failed / ${error.message ?: "check Supabase URL, key, and RLS"}"
                }
            }
        }
    }

    private fun renderRoleWorkspace(session: SessionStore.Session) {
        roleContent.removeAllViews()
        when (session.role) {
            "control_room" -> renderControlRoom(session)
            "disaster_authority" -> renderDisasterAuthority(session)
            "village_authority" -> renderVillageAuthority(session)
            "community_member" -> renderCommunityMember(session)
            else -> renderSystemAdmin(session)
        }
    }

    private fun renderControlRoom(session: SessionStore.Session) {
        val data = dashboardSummary
        val station = data?.stations?.firstOrNull()
        val evaluation = data?.evaluations?.firstOrNull()
        addSection("SITUATION OVERVIEW", if (data == null) {
            "No dashboard data loaded\nTap Connect to dashboard"
        } else {
            "${data.alerts.size} active alert(s)\n${station?.river ?: "No river"} / ${station?.name ?: "No station"}\nRisk ${evaluation?.riskLevel ?: "unknown"} / ${evaluation?.score ?: "n/a"}\nWater level: ${station?.waterLevel ?: "n/a"}"
        })
        val pending = emergencyStore.pendingAlerts().firstOrNull()
        val remoteAlert = data?.alerts?.firstOrNull()
        addSection("ALERT QUEUE", remoteAlert?.let { "${it.priority} / ${it.title}\nStatus: ${it.status}" }
            ?: pending?.let { "${it.severity} / ${it.title}\n${it.village}\n${it.message}\nStatus: ${it.status}" }
            ?: "No alerts loaded")
        pending?.let { alert ->
            addAction("Approve public warning") { emergencyStore.updateAlertStatus(alert.id, "APPROVED", session.username); renderRoleWorkspace(session) }
            addAction("Reject / dismiss") { emergencyStore.updateAlertStatus(alert.id, "DISMISSED", session.username); renderRoleWorkspace(session) }
        }
        addSection("IMPACT", "Japisagiya Gaon  /  Critical  /  15 min\nDesang Deroi Habi  /  Critical  /  30 min\nRajan Bagan  /  High  /  45 min")
        addSection("COMMUNICATION", "Internet  Operational\nCellular  Operational\nMesh  Standby")
    }

    private fun renderDisasterAuthority(session: SessionStore.Session) {
        val data = dashboardSummary
        val stationNames = data?.stations?.joinToString(", ") { it.name }
        addSection("REGIONAL SITUATION", if (data == null) {
            "No dashboard data loaded\nTap Connect to dashboard"
        } else {
            "${data.alerts.size} active alert(s)\n${data.stations.size} monitoring station(s)\nStations: ${stationNames ?: "none"}\nLatest risk: ${data.evaluations.firstOrNull()?.riskLevel ?: "unknown"}"
        })
        val pending = emergencyStore.pendingAlerts().firstOrNull()
        val remoteAlert = data?.alerts?.firstOrNull()
        addSection("APPROVAL QUEUE", remoteAlert?.let { "${it.priority} / ${it.title}\nStatus: ${it.status}" }
            ?: pending?.let { "${it.severity} / ${it.title}\nStatus: ${it.status}" }
            ?: "Approval queue is clear")
        pending?.let { alert ->
            addAction("Approve regional warning") { emergencyStore.updateAlertStatus(alert.id, "APPROVED", session.username); renderRoleWorkspace(session) }
            addAction("Request more information") { emergencyStore.updateAlertStatus(alert.id, "INFO_REQUESTED", session.username); renderRoleWorkspace(session) }
        }
        addSection("REGIONAL IMPACT", "Japisagiya Gaon  2,845 people  15 min  Critical\nDesang Deroi Habi  1,204 people  30 min  Critical\nRajan Bagan  955 people  45 min  High")
        addSection("COMMUNICATION OVERVIEW", "Internet  Available\nCellular  Available\nMesh  Ready for failover")
    }

    private fun renderVillageAuthority(session: SessionStore.Session) {
        val alert = emergencyStore.latestAlert()
        val remoteAlert = dashboardSummary?.alerts?.firstOrNull()
        val station = dashboardSummary?.stations?.firstOrNull()
        addSection("MY VILLAGE / LOCAL AREA", "Station: ${station?.name ?: "Not loaded"}\nRiver: ${station?.river ?: "Not loaded"}\nWater level: ${station?.waterLevel ?: "n/a"}")
        addSection("CURRENT WARNING", remoteAlert?.let { "${it.title.uppercase()}\nPriority: ${it.priority}\nStatus: ${it.status}" }
            ?: alert?.let { "${it.title.uppercase()}\n${it.message}\nPriority: ${it.severity}" }
            ?: "No active warning")
        alert?.let { addAction("Village authority received warning") { emergencyStore.acknowledge(it.id, session.username); updateStatus("Warning acknowledgement saved locally") } }
        addSection("LOCAL COMMUNICATION", "Internet  Available\nCellular  Available\nOffline mesh  Standby")
        addAction("Report local situation") { showReportDialog(session) }
        addSection("REPORTS SAVED", "${emergencyStore.reports().count { it.village == "Japisagiya Gaon" }} local report(s) awaiting sync")
    }

    private fun renderCommunityMember(session: SessionStore.Session) {
        val alert = emergencyStore.latestAlert()
        val remoteAlert = dashboardSummary?.alerts?.firstOrNull()
        addSection("EMERGENCY INFORMATION", remoteAlert?.let { "${it.priority} WARNING\n${it.title}\nStatus: ${it.status}" }
            ?: alert?.let { "${it.severity} WARNING\n${it.title}\n${it.message}" }
            ?: "No active emergency warning")
        addSection("WHAT TO DO", "Move toward the designated safe area.\nKeep your phone charged.\nFollow village authority instructions.\nDo not return until cleared.")
        alert?.let { addAction("I received this warning") { emergencyStore.acknowledge(it.id, session.username); updateStatus("Alert receipt saved locally") } }
        addAction("Report an emergency") { showReportDialog(session) }
        addSection("MY VILLAGE", "Japisagiya Gaon\nNearest safe area: Community high ground\nMesh relay: Available")
    }

    private fun renderSystemAdmin(session: SessionStore.Session) {
        val data = dashboardSummary
        addSection("SYSTEM HEALTH", "Database  ${if (data == null) "Not connected" else "Supabase data loaded"}\nNearby relay  Available\nOffline queue  ${emergencyStore.reports().size} report(s)\nAudit events  ${emergencyStore.auditEntries()}")
        addSection("SUPABASE DATA", "Stations  ${data?.stations?.size ?: 0}\nActive alerts  ${data?.alerts?.size ?: 0}\nRule evaluations  ${data?.evaluations?.size ?: 0}")
        addSection("DEVICE MANAGEMENT", "This device: ${deviceName()}\nRelay registration: local\nLast sync: offline mode")
        addSection("AUDIT LOG", "Emergency actions are recorded locally and can be synchronized when the backend is available.")
    }

    private fun addSection(title: String, body: String) {
        val titleView = TextView(this).apply { text = title; setTextColor(Color.rgb(121, 145, 142)); textSize = 11f; typeface = android.graphics.Typeface.MONOSPACE }
        val bodyView = TextView(this).apply { text = body; setTextColor(Color.rgb(232, 240, 236)); textSize = 15f; setPadding(0, 6, 0, 14) }
        roleContent.addView(titleView); roleContent.addView(bodyView)
    }

    private fun addAction(label: String, action: () -> Unit) {
        roleContent.addView(Button(this).apply { text = label; isAllCaps = false; setOnClickListener { action() } })
    }

    private fun showReportDialog(session: SessionStore.Session) {
        val input = EditText(this).apply { hint = "Describe what is happening"; minLines = 3 }
        val types = arrayOf("Water rising", "Flooding observed", "Road blocked", "Evacuation issue", "Other emergency")
        val choices = types.map { type -> RadioButton(this).apply { text = type } }
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 8, 32, 0) }
        choices.forEach { box.addView(it) }; box.addView(input)
        AlertDialog.Builder(this).setTitle("Report local situation").setView(box).setNegativeButton("Cancel", null).setPositiveButton("Save report") { _, _ ->
            val type = choices.firstOrNull { it.isChecked }?.text?.toString() ?: "Other emergency"
            emergencyStore.addReport(type, input.text.toString().ifBlank { "No description provided" }, "Japisagiya Gaon", session.username)
            updateStatus("Report saved locally and queued for sync")
            renderRoleWorkspace(session)
        }.show()
    }

    private fun requestPermissionsAndStart() {
        val permissions = requiredPermissions()
        val missing = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) {
            updateStatus("Allow Nearby devices permission to start the relay")
            requestPermissions(missing.toTypedArray(), 100)
        } else {
            startRelay()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode != 100) return
        if (results.isNotEmpty() && results.all { it == PackageManager.PERMISSION_GRANTED }) {
            startRelay()
        } else {
            updateStatus("Nearby permission denied. Enable it in App settings and retry")
        }
    }

    private fun startRelay() {
        if (relayStarted) {
            updateStatus("Relay already active / waiting for nearby phones")
            return
        }
        try {
            val advertising = AdvertisingOptions.Builder().setStrategy(strategy).build()
            val discovery = DiscoveryOptions.Builder().setStrategy(strategy).build()
            connections.stopAdvertising()
            connections.stopDiscovery()
            updateStatus("Starting Nearby relay...")
            connections.startAdvertising(deviceName(), serviceId, lifecycleCallback, advertising)
                .addOnSuccessListener {
                    relayStarted = true
                    updateStatus("Relay active / advertising as ${deviceName()}")
                }
                .addOnFailureListener { error ->
                    relayStarted = false
                    updateStatus("Advertising unavailable: ${nearbyError(error)}")
                }
            connections.startDiscovery(serviceId, discoveryCallback, discovery)
                .addOnSuccessListener {
                    relayStarted = true
                    updateStatus("Relay active / looking for nearby phones")
                }
                .addOnFailureListener { error ->
                    val message = error.message.orEmpty()
                    if (message.contains("already", ignoreCase = true) || message.contains("discover", ignoreCase = true)) {
                        relayStarted = true
                        updateStatus("Relay active / already discovering nearby phones")
                    } else {
                        updateStatus("Discovery unavailable: ${nearbyError(error)}")
                    }
                }
        } catch (error: SecurityException) {
            relayStarted = false
            updateStatus("Nearby permission missing. Enable Nearby devices and retry")
        }
    }

    private fun sendDemoAlert() {
        if (!relayStarted) startRelay()
        val id = UUID.randomUUID().toString()
        val message = "$id|P0|FLASH FLOOD|Bhairavpur|14 minutes to impact. Move to higher ground.|$defaultChainHops|${deviceName()}"
        receiveAndRelay(message, null)
    }

    private fun receiveAndRelay(message: String, fromEndpointId: String?) {
        val parts = message.split('|', limit = 8)
        if (parts.size < 5 || !receivedAlertIds.add(parts[0])) return
        val remainingHops = parts.getOrNull(5)?.toIntOrNull() ?: 0
        val visitedNames = parts.getOrNull(6).orEmpty().split(',').filter { it.isNotBlank() }.toSet()
        emergencyStore.addAlert(parts[0], parts[1], parts[2], parts[3], parts[4])
        runOnUiThread {
            alertsText.text = "${parts[1]} / ${parts[2]}\n${parts[3]}\n${parts[4]}\nChain hops remaining: $remainingHops"
            showAlertNotification(parts[2], "${parts[3]}: ${parts[4]}")
        }
        forwardToNextHop(parts, remainingHops, fromEndpointId, visitedNames)
    }

    private fun forwardToNextHop(parts: List<String>, remainingHops: Int, fromEndpointId: String?, visitedNames: Set<String>) {
        if (remainingHops <= 0) {
            updateStatus("Alert delivered / chain complete")
            return
        }
        val nextEndpoint = connectedEndpoints
            .filter { it != fromEndpointId }
            .filter { endpointNames[it].orEmpty() !in visitedNames }
            .sorted()
            .firstOrNull()
        if (nextEndpoint == null) {
            updateStatus("Alert stored / waiting for the next relay node")
            return
        }
        val nextName = endpointNames[nextEndpoint].orEmpty().ifBlank { "node-${nextEndpoint.take(6)}" }
        val forwardedMessage = parts.take(5).joinToString("|") + "|${remainingHops - 1}|${(visitedNames + nextName).joinToString(",")}"
        connections.sendPayload(nextEndpoint, Payload.fromBytes(forwardedMessage.toByteArray(StandardCharsets.UTF_8)))
        updateStatus("Alert forwarded one hop / ${remainingHops - 1} remaining")
    }

    private fun showAlertNotification(title: String, body: String) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val notification = NotificationCompat.Builder(this, notificationChannel)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("P0 flood warning / $title")
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(this).notify(1001, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(notificationChannel, "Emergency alerts", NotificationManager.IMPORTANCE_HIGH)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun requiredPermissions(): Array<String> = if (Build.VERSION.SDK_INT >= 33) {
        arrayOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.NEARBY_WIFI_DEVICES)
    } else if (Build.VERSION.SDK_INT >= 31) {
        arrayOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    private fun deviceName(): String = "LastMile-${Build.MODEL.take(12)}"

    private fun nearbyError(error: Exception): String = error.message
        ?.takeIf { it.isNotBlank() }
        ?: "turn on Bluetooth and Nearby devices permissions"

    private fun updateStatus(message: String) = runOnUiThread { statusText.text = message }
}
