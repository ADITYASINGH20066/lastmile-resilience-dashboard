from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.db.supabase import get_admin_client

router = APIRouter(prefix="/village-delivery", tags=["Village Delivery"])


def _safe_error(exc: Exception) -> str:
    return str(exc).split("\n", 1)[0][:300]


def _preferred_route(village: dict[str, Any]) -> list[str]:
    if village.get("internet_available") is True:
        return ["app_push"]
    if village.get("cellular_available") is True:
        return ["sms", "call"]
    return ["offline_relay"]


@router.get("/summary")
async def village_delivery_summary(
    river_code: str = Query(..., min_length=2),
):
    """Return the backend delivery picture for every village in one basin.

    This endpoint does not create targets or deliveries. Approval/dispatch remains
    an explicit backend action. It only joins existing alert, impact, target and
    delivery records into a UI-safe operational view.
    """
    admin = get_admin_client()
    code = river_code.upper().strip()

    basin_rows = (
        admin.table("basins")
        .select("*")
        .eq("basin_code", code)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not basin_rows:
        raise HTTPException(status_code=404, detail="River not found")
    basin = basin_rows[0]
    basin_id = str(basin["id"])

    stations = (
        admin.table("hydro_stations")
        .select("*")
        .eq("basin_id", basin_id)
        .order("station_name")
        .execute()
        .data
        or []
    )
    station_ids = {str(row["id"]) for row in stations if row.get("id")}
    station_map = {str(row["id"]): row for row in stations if row.get("id")}

    villages = (
        admin.table("villages")
        .select("*")
        .eq("basin_id", basin_id)
        .order("vulnerability_score", desc=True)
        .execute()
        .data
        or []
    )

    # Resolve the newest operational alert for this basin through its event.
    events = (
        admin.table("events")
        .select("*")
        .eq("basin_id", basin_id)
        .order("last_observed_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    event_ids = [str(row["id"]) for row in events if row.get("id")]
    active_alert = None
    if event_ids:
        alert_rows = (
            admin.table("alerts")
            .select("*")
            .in_("event_id", event_ids)
            .in_("status", ["pending_approval", "approved", "dispatching", "active"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        if alert_rows:
            active_alert = alert_rows[0]

    event_id = str(active_alert["event_id"]) if active_alert and active_alert.get("event_id") else None

    impacts: list[dict[str, Any]] = []
    if event_id:
        impacts = (
            admin.table("impact_assessments")
            .select("*")
            .eq("event_id", event_id)
            .order("downstream_order")
            .execute()
            .data
            or []
        )
    impact_map = {str(row.get("village_id")): row for row in impacts if row.get("village_id")}

    targets: list[dict[str, Any]] = []
    deliveries: list[dict[str, Any]] = []
    if active_alert and active_alert.get("id"):
        alert_id = str(active_alert["id"])
        targets = (
            admin.table("alert_targets")
            .select("*")
            .eq("alert_id", alert_id)
            .execute()
            .data
            or []
        )
        deliveries = (
            admin.table("alert_deliveries")
            .select("*")
            .eq("alert_id", alert_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    target_map = {str(row.get("village_id")): row for row in targets if row.get("village_id")}
    deliveries_by_village: dict[str, list[dict[str, Any]]] = {}
    for row in deliveries:
        village_id = row.get("village_id")
        if village_id:
            deliveries_by_village.setdefault(str(village_id), []).append(row)

    rows: list[dict[str, Any]] = []
    for village in villages:
        village_id = str(village["id"])
        impact = impact_map.get(village_id)
        target = target_map.get(village_id)
        village_deliveries = deliveries_by_village.get(village_id, [])

        if not active_alert:
            delivery_state = "monitoring"
        elif village_deliveries:
            statuses = {str(item.get("delivery_status", "unknown")).lower() for item in village_deliveries}
            if "delivered" in statuses:
                delivery_state = "delivered"
            elif "failed" in statuses:
                delivery_state = "failed"
            elif "sent" in statuses:
                delivery_state = "sent"
            else:
                delivery_state = sorted(statuses)[0] if statuses else "pending"
        elif target:
            delivery_state = str(target.get("target_status") or "pending")
        else:
            delivery_state = "awaiting_approval" if active_alert.get("status") == "pending_approval" else "not_dispatched"

        actual_channels = [str(item.get("channel")) for item in village_deliveries if item.get("channel")]
        route = actual_channels or _preferred_route(village)
        rows.append(
            {
                "village": {
                    "id": village.get("id"),
                    "village_code": village.get("village_code"),
                    "village_name": village.get("village_name"),
                    "district": village.get("district"),
                    "state": village.get("state"),
                    "population": village.get("population"),
                    "vulnerability_score": village.get("vulnerability_score"),
                    "internet_available": village.get("internet_available"),
                    "cellular_available": village.get("cellular_available"),
                },
                "impact": impact,
                "target": target,
                "deliveries": village_deliveries,
                "delivery_state": delivery_state,
                "route": route,
                "is_simulated_delivery": any(item.get("is_simulated") is True for item in village_deliveries),
            }
        )

    delivered_count = sum(1 for row in rows if row["delivery_state"] == "delivered")
    targeted_count = sum(1 for row in rows if row["target"] is not None)

    return {
        "river": basin,
        "stations": [
            {
                "id": row.get("id"),
                "station_code": row.get("station_code"),
                "station_name": row.get("station_name"),
                "river_name": row.get("river_name"),
            }
            for row in stations
        ],
        "alert": active_alert,
        "event_id": event_id,
        "summary": {
            "villages": len(rows),
            "targeted": targeted_count,
            "delivered": delivered_count,
            "deliveries": len(deliveries),
        },
        "villages": rows,
    }
