# SENTINEL-X Phase 2 — Inbound 500 Fix

Replaces `server/app/api/inbound.py` only.

Why: the original inbound endpoint used brittle explicit column projections across several tables. The replacement reads the current project rows with `select("*")`, normalizes them for the frontend, and isolates source-level query errors so one optional/mismatched source field does not crash the whole endpoint.

Apply:

```bash
cd ~/Downloads/SIH/lastmile-resilience-dashboard
cp server/app/api/inbound.py server/app/api/inbound.py.phase2-before-500-fix.backup
unzip -o ~/Downloads/SENTINEL-X-phase2-inbound-500-fix.zip
```

Restart FastAPI and test:

```bash
curl "http://127.0.0.1:8000/api/inbound/summary?river_code=DESANG&limit=50"
```

The response includes `source_errors` if an individual optional source query fails, while still returning the healthy sources.
