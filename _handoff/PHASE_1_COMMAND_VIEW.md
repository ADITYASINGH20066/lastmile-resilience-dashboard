# SENTINEL-X Phase 1 — Control Room / Command View

This phase completes only the Control Room > Command View and leaves other dashboard phases untouched.

Backend sources used:
- GET /api/dashboard/summary
- GET /api/rivers/{river_code}/villages
- GET /api/alerts/{alert_id}/impact
- GET /api/alerts/{alert_id}

The dashboard summary now selects the five rule-engine score components already written by the scoring service: level_score, rate_score, sensor_score, community_score, persistence_score.

The new Command View removes the old page-level network simulator, hardcoded relay rows, fake delivery percentages and browser notification test. It shows station telemetry, thresholds, data mode, rule-engine score and score breakdown, active alert state, backend impact assessment and affected villages.

The page's refresh button re-fetches the existing backend endpoints. Historical/replay data is explicitly labelled and is not presented as a live CWC feed.

Not included yet:
- Inbound Data implementation (Phase 2)
- Village Delivery implementation (Phase 3)
- Connectivity implementation (Phase 4)
- Supabase Auth / real role routing
- Alert approval action
