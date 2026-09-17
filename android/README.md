# LastMile Android relay

This companion app provides the physical proof-of-concept for LastMile. It uses Google Nearby Connections with `P2P_CLUSTER` to discover nearby Android devices, accepts relay connections, shows a native emergency notification, and forwards each alert once.

## Build and install

Open the `android` folder in Android Studio, let Gradle sync, then run the `app` configuration on two or three Android phones. The app needs Bluetooth/Nearby permissions and notification permission.

## Demo

1. Install the app on Phone A, Phone B, and Phone C.
2. On all three phones, tap **Start nearby relay** and allow every permission.
3. Keep mobile data and internet unavailable. Keep Bluetooth and Wi-Fi enabled because Nearby Connections uses the device radios for local discovery.
4. Tap **Send demo P0 flood alert** on Phone A.
5. Each phone displays the alert and a native notification. Connected phones forward the same alert, while the alert ID prevents duplicate notifications.

This Android proof-of-concept is intentionally separate from the browser dashboard. The dashboard remains the large-scale digital twin; this app proves that the last hop can reach real devices.
