package com.lastmile.alert

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
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
    private val connectedEndpoints = mutableSetOf<String>()
    private val receivedAlertIds = mutableSetOf<String>()
    private val strategy = Strategy.P2P_CLUSTER
    private val serviceId = "com.lastmile.alert.RELAY"
    private val notificationChannel = "lastmile-alerts"
    private var relayStarted = false

    private val lifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: com.google.android.gms.nearby.connection.ConnectionInfo) {
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
            receiveAndRelay(message)
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        connections = Nearby.getConnectionsClient(this)
        statusText = findViewById(R.id.statusText)
        alertsText = findViewById(R.id.alertsText)
        createNotificationChannel()

        findViewById<Button>(R.id.relayButton).setOnClickListener { requestPermissionsAndStart() }
        findViewById<Button>(R.id.sendButton).setOnClickListener { sendDemoAlert() }
    }

    private fun requestPermissionsAndStart() {
        val permissions = requiredPermissions()
        val missing = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) {
            requestPermissions(missing.toTypedArray(), 100)
        } else {
            startRelay()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == 100 && results.all { it == PackageManager.PERMISSION_GRANTED }) startRelay()
        else updateStatus("Nearby permissions are required to relay alerts")
    }

    private fun startRelay() {
        if (relayStarted) {
            updateStatus("Relay already active / waiting for nearby phones")
            return
        }
        relayStarted = true
        val advertising = AdvertisingOptions.Builder().setStrategy(strategy).build()
        val discovery = DiscoveryOptions.Builder().setStrategy(strategy).build()
        connections.stopAdvertising()
        connections.stopDiscovery()
        connections.startAdvertising(deviceName(), serviceId, lifecycleCallback, advertising)
            .addOnSuccessListener { updateStatus("Relay active / advertising as ${deviceName()}") }
            .addOnFailureListener { error -> updateStatus("Advertising unavailable: ${error.message ?: "check Bluetooth and Nearby permissions"}") }
        connections.startDiscovery(serviceId, discoveryCallback, discovery)
            .addOnSuccessListener { updateStatus("Relay active / looking for nearby phones") }
            .addOnFailureListener { error ->
                val message = error.message.orEmpty()
                if (message.contains("already", ignoreCase = true) || message.contains("discover", ignoreCase = true)) {
                    updateStatus("Relay active / already discovering nearby phones")
                } else {
                    updateStatus("Discovery unavailable: ${message.ifBlank { "check Bluetooth and Nearby permissions" }}")
                }
            }
    }

    private fun sendDemoAlert() {
        if (!relayStarted) startRelay()
        val id = UUID.randomUUID().toString()
        val message = "$id|P0|FLASH FLOOD|Bhairavpur|14 minutes to impact. Move to higher ground."
        receiveAndRelay(message)
    }

    private fun receiveAndRelay(message: String) {
        val parts = message.split('|', limit = 5)
        if (parts.size < 5 || !receivedAlertIds.add(parts[0])) return
        runOnUiThread {
            alertsText.text = "${parts[1]} / ${parts[2]}\n${parts[3]}\n${parts[4]}"
            showAlertNotification(parts[2], "${parts[3]}: ${parts[4]}")
        }
        val payload = Payload.fromBytes(message.toByteArray(StandardCharsets.UTF_8))
        connectedEndpoints.forEach { endpointId -> connections.sendPayload(endpointId, payload) }
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
        arrayOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.NEARBY_WIFI_DEVICES, Manifest.permission.POST_NOTIFICATIONS)
    } else if (Build.VERSION.SDK_INT >= 31) {
        arrayOf(Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.POST_NOTIFICATIONS)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    private fun deviceName(): String = "LastMile-${Build.MODEL.take(12)}"

    private fun updateStatus(message: String) = runOnUiThread { statusText.text = message }
}
