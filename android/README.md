# LastMile Android relay

This companion app provides the physical proof-of-concept for LastMile. It uses Google Nearby Connections with `P2P_CLUSTER` to discover nearby Android devices, accepts relay connections, shows a native emergency notification, and forwards each alert one hop at a time.

## Build and install

Open the `android` folder in Android Studio, let Gradle sync, then run the `app` configuration on two or three Android phones. The app needs Bluetooth/Nearby permissions and notification permission.

## Demo

1. Install the app on Phone A, Phone B, and Phone C.
2. On all three phones, tap **Start nearby relay** and allow every permission.
3. Keep mobile data and internet unavailable. Keep Bluetooth and Wi-Fi enabled because Nearby Connections uses the device radios for local discovery.
4. Tap **Send chained P0 alert** on Phone A.
5. Phone A sends to one nearby phone. That phone sends to the next available phone, and so on. Each alert carries a hop limit; the alert ID prevents loops and duplicate notifications.

The chain is intentionally single-next-hop, not broadcast: `A -> B -> C -> D`. All phones still advertise and discover peers, so the next hop can be selected as devices connect or disconnect.

This Android proof-of-concept is intentionally separate from the browser dashboard. The dashboard remains the large-scale digital twin; this app proves that the last hop can reach real devices.

## Android role workspaces

The app now uses a protected local login and renders a different operational workspace for each role:

- Control Room: alert queue, approval or dismissal, impact view, communication state, and relay controls.
- Disaster Authority: regional situation, approval queue, regional impact, and communication overview.
- Village Authority: village warning, receipt acknowledgement, local incident reporting, and offline queue count.
- Community Member: simplified emergency instructions, warning receipt, and emergency reporting.
- System Admin: local system health, device status, audit count, and account overview.

The Android database stores users, alerts, local incident reports, alert acknowledgements, and audit events. Reports and acknowledgements are queued locally so the Nearby relay continues to work without internet. The browser/backend sync remains a later deployment integration.

New users can use **Create new account** on the login screen, choose their own username and password, select a workspace role, and enter the dashboard immediately. The chosen username is used as the displayed account name. Authentication and profiles are now stored in Supabase Auth and `user_profiles`; the local database is reserved for offline emergency records.

For a local build, add `supabaseUrl` and `supabaseAnonKey` to the ignored `android/local.properties` file. Android uses the anon key only. Disable Supabase email confirmation for this username-based demo, or provide a confirmation flow before expecting signup to open the dashboard automatically.

Proof-of-concept accounts:

- `control` / `1234`
- `authority` / `1234`
- `village` / `1234`
- `community` / `1234`
- `admin` / `1234`
