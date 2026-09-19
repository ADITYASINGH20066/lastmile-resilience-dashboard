# SENTINEL-X Phase 2 — Inbound Data

## Scope
Control Room → Inbound Data only.

## What is now real
- Hydro observations are read from `hydro_readings` for the selected basin's `hydro_stations`.
- Field sensor readings are read from `sensor_readings` and associated to `sensor_devices`; station linkage comes from the ingestion metadata currently written by `/api/sensors/readings`.
- Community reports are read from `community_reports` for the selected basin's stations, with village/station names resolved by the backend.
- Rule evaluations linked to the selected basin's hydro readings are shown as processing records.
- The UI supports source filtering, search, record inspection and basin switching.

## Backend
New endpoint: `GET /api/inbound/summary?river_code=DESANG&limit=50`

No database schema changes are required.

## Files changed
- `src/App.tsx`
- `src/api.ts`
- `src/styles.css`
- `src/InboundDataPage.tsx` (new)
- `server/app/api/inbound.py` (new)
- `server/app/main.py`

## Important limitation
SACHET/Sentinel ingestion remains idle. Connectivity/delivery state is not represented as real inbound data in this phase.
