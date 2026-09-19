# SENTINEL-X — Phase 0 Database → UI Map

## Authoritative tables for the current prototype

- `basins`
- `hydro_stations`
- `hydro_readings`
- `sensor_devices`
- `sensor_readings`
- `community_reports`
- `rule_evaluations`
- `events`
- `event_observations`
- `villages`
- `impact_assessments`
- `alerts`
- `alert_targets`
- `alert_deliveries`
- `user_profiles`

## Intentionally idle for now

- SACHET ingestion tables/infrastructure
- Sentinel ingestion/analysis tables/infrastructure
- live satellite ingestion
- real Cell Broadcast integration
- real LoRa hardware communication

## Page build order

1. Control Room — Command View
2. Control Room — Inbound Data
3. Control Room — Village Delivery
4. Control Room — Connectivity
5. Disaster Authority
6. Village Authority
7. Community Member
8. System Admin
9. Supabase Auth + role routing
10. End-to-end integration

Each page is considered complete only when its main data, interactions, loading state and error state are connected to the backend.
