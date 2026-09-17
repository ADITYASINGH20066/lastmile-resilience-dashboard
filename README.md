# LastMile / resilience command

A focused hackathon MVP for disaster warnings that remain useful as infrastructure fails. This app is a front-end simulation of a CAP-compatible warning entering a partially disconnected population, then switching to opportunistic phone relays.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. For a production check:

```bash
npm run build
```

## Test on a phone

Deploy the built site to any HTTPS static host, open that URL on the phone, and choose **Add to Home Screen**. Open the installed LastMile app, allow notifications, then use **Send test notification** in the dashboard. This version sends a local browser notification from the installed app.

For alerts sent to phones when the app is closed, add a backend push service such as Firebase Cloud Messaging or Web Push. The dashboard UI and PWA shell are ready for that integration, but credentials and a server-side alert gateway are intentionally not included in this MVP.

## Real Android relay demo

The `android` folder contains a Kotlin companion app using Google Nearby Connections. Open that folder in Android Studio and run it on 2-3 Android phones. Start the relay on every phone, then tap **Send demo P0 flood alert** on Phone A. The alert is shown as a native notification and forwarded to nearby phones. See [android/README.md](android/README.md) for the demo steps.

## Demo flow

1. Click **Launch verified alert** to start the seeded Uttarakhand flood scenario.
2. Click **Simulate network failure**. Internet and cellular paths go down, while offline mesh becomes the active route.
3. Click **Advance mesh propagation** to move the alert through ranked relays and close the Kalyanpur and Devgarh coverage gaps.
4. Toggle individual communication paths in **Communication health** to show how the network twin responds.

The current app intentionally simulates device-to-device delivery in the browser. A production Android companion would replace the simulation state with Wi-Fi Direct/Bluetooth discovery and local store-and-forward queues.
