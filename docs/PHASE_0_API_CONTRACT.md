# SENTINEL-X — Phase 0 API Contract

Purpose: establish one stable frontend data contract before implementing dashboards page-by-page.

## Existing backend endpoints

| Endpoint | Method | Current role | Primary data | Phase |
|---|---:|---|---|---|
| `/health` | GET | public | service availability | 0 |
| `/auth/me` | GET | authenticated | `user_profiles` + Supabase user | 9 |
| `/rivers` | GET | dashboard | `basins` | 1 |
| `/rivers/{river}/stations` | GET | dashboard | `hydro_stations` | 1 |
| `/rivers/{river}/villages` | GET | dashboard | `villages` | 1/5/6 |
| `/hydro/readings` | GET | control room | `hydro_readings` | 1/2 |
| `/dashboard/summary` | GET | control room | stations + evaluations + alerts | 1 |
| `/alerts/active` | GET | operational | `alerts` | 1/3 |
| `/alerts/{id}` | GET | operational | `alerts` + targets + deliveries | 3 |
| `/alerts/{id}/impact` | GET | operational | `impact_assessments` | 1/3 |
| `/alerts/{id}/impact` | POST | control/disaster/admin | builds impact | 1/3 |
| `/alerts/{id}/approve` | POST | authorized role | changes alert workflow | 5/9 |
| `/community/options` | GET | authenticated | report choices | 6/7 |
| `/community/reports` | POST | community/village/control/admin | `community_reports` + rule evaluation | 6/7 |
| `/community/reports/recent` | GET | control/disaster/admin | recent reports | 2 |
| `/sensors/readings` | POST | sensor ingestion | `sensor_readings` + rule evaluation | 2 |
| `/demo/replay/{river}` | POST | demo | historical replay | 1 |

## Data ownership by dashboard

### Control Room
- Command View: hydro stations/readings, evaluations, alerts, impact assessments, villages.
- Inbound Data: hydro readings + sensor readings + recent community reports.
- Village Delivery: alert targets + alert deliveries + village metadata.
- Connectivity: later integration with delivery/network state; do not use local React booleans as authoritative data.
- Audit: later requires a durable activity/audit source; do not fabricate an audit history from UI state.

### Disaster Authority
- Regional hazard + population + alert readiness from the same backend data.
- Authorization actions remain backend-protected.

### Village Authority
- Must be scoped to the authenticated user's `village_id` in Phase 6/9.
- Local reports go through `/community/reports`.

### Community Member
- Must be scoped to the authenticated user's `village_id` in Phase 7/9.
- Warning receipt/acknowledgement must become a persisted backend action; React local state is not authoritative.

### Admin
- Service health, data freshness and role directory should eventually come from backend data, not hardcoded `true` values.

## Rules for all future pages

1. No operational number, status, delivery state or role scope is hardcoded in a completed page.
2. A page may show static explanatory copy, but live values must come from an API result.
3. Loading, empty and error states are first-class UI states.
4. Frontend hiding is UX only. Backend role checks remain authoritative.
5. CWC rows labelled historical/replay must remain clearly identified as such; do not call them live CWC.
6. SACHET/Sentinel ingestion remains idle/future scope for the current prototype.
