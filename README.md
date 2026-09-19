# SENTINEL-X — Phase 8: System Admin

This phase replaces the previous demo-only admin panel with a dedicated administrative read model.

## Added
- `src/AdminPage.tsx`
- `GET /api/admin/summary`
- Admin data inventory, service health, both monitored basins, role-directory counts, data freshness, and future integration status.

## Updated
- `src/roleWorkspaces.tsx`
- `src/api.ts`
- `src/styles.css`
- `server/app/main.py`

## Scope
System Admin is intentionally read-only in this prototype. It does not approve alerts, edit source records, or replace Control Room / Disaster Authority workflows.

SACHET and Sentinel remain idle/future scope. Offline Android relay telemetry and real Supabase Auth remain explicitly pending.

## Install
Back up your current files, then extract this ZIP at the project root.
