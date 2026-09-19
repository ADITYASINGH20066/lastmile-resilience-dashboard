from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.db.supabase import get_admin_client

router = APIRouter(prefix="/admin", tags=["Admin"])

RIVERS = (
    {"code": "TEESTA", "name": "Teesta", "station_code": "CWC_MELLI"},
    {"code": "DESANG", "name": "Desang", "station_code": "CWC_NANGLAMORAGHAT"},
)

ROLE_LABELS = (
    ("control_room", "Control Room"),
    ("disaster_authority", "Disaster Authority"),
    ("village_authority", "Village Authority"),
    ("community_member", "Community Member"),
    ("admin", "System Admin"),
)


def _safe_rows(table: str, query: Any, errors: list[str]) -> list[dict]:
    try:
        response = query.execute()
        return response.data or []
    except Exception as exc:  # keep the admin page readable even if one optional table/column is unavailable
        errors.append(f"{table}: {exc}")
        return []


def _count(table: str, errors: list[str]) -> int:
    admin = get_admin_client()
    return len(_safe_rows(table, admin.table(table).select("*"), errors))


def _latest(table: str, timestamp_column: str, columns: str, errors: list[str]) -> dict | None:
    admin = get_admin_client()
    rows = _safe_rows(
        table,
        admin.table(table).select(columns).order(timestamp_column, desc=True).limit(1),
        errors,
    )
    return rows[0] if rows else None


@router.get("/summary")
async def summary():
    admin = get_admin_client()
    errors: list[str] = []

    active_alerts = _safe_rows(
        "alerts",
        admin.table("alerts")
        .select("id,event_id,status")
        .in_("status", ["approved", "dispatching", "active"]),
        errors,
    )

    metrics = {
        "active_alerts": len(active_alerts),
        "community_reports": _count("community_reports", errors),
        "user_profiles": _count("user_profiles", errors),
        "hydro_stations": _count("hydro_stations", errors),
        "hydro_readings": _count("hydro_readings", errors),
        "sensor_readings": _count("sensor_readings", errors),
        "rule_evaluations": _count("rule_evaluations", errors),
        "events": _count("events", errors),
        "alert_deliveries": _count("alert_deliveries", errors),
    }

    basins: list[dict] = []
    for river in RIVERS:
        basin_rows = _safe_rows(
            "basins",
            admin.table("basins").select("id,basin_code,basin_name").eq("basin_code", river["code"]).limit(1),
            errors,
        )
        basin = basin_rows[0] if basin_rows else None

        station = None
        latest_reading = None
        latest_evaluation = None
        basin_active_alerts = 0
        village_count = 0

        if basin:
            station_rows = _safe_rows(
                "hydro_stations",
                admin.table("hydro_stations")
                .select("id,station_code,station_name,basin_id")
                .eq("basin_id", str(basin["id"]))
                .order("station_name")
                .limit(1),
                errors,
            )
            station = station_rows[0] if station_rows else None

            village_rows = _safe_rows(
                "villages",
                admin.table("villages").select("id").eq("basin_id", str(basin["id"])),
                errors,
            )
            village_count = len(village_rows)

            event_rows = _safe_rows(
                "events",
                admin.table("events").select("id").eq("basin_id", str(basin["id"])).in_("status", ["monitoring", "active", "confirmed"]),
                errors,
            )
            event_ids = {str(row["id"]) for row in event_rows if row.get("id")}
            basin_active_alerts = sum(1 for alert in active_alerts if str(alert.get("event_id")) in event_ids)

            if station:
                reading_rows = _safe_rows(
                    "hydro_readings",
                    admin.table("hydro_readings")
                    .select("id,water_level_m,observed_at")
                    .eq("station_id", str(station["id"]))
                    .order("observed_at", desc=True)
                    .limit(1),
                    errors,
                )
                latest_reading = reading_rows[0] if reading_rows else None

                if latest_reading:
                    evaluation_rows = _safe_rows(
                        "rule_evaluations",
                        admin.table("rule_evaluations")
                        .select("risk_level,total_score,evaluated_at")
                        .eq("hydro_reading_id", str(latest_reading["id"]))
                        .order("evaluated_at", desc=True)
                        .limit(1),
                        errors,
                    )
                    latest_evaluation = evaluation_rows[0] if evaluation_rows else None

        basins.append(
            {
                "code": river["code"],
                "name": river["name"],
                "station_code": station.get("station_code") if station else river["station_code"],
                "station_name": station.get("station_name") if station else None,
                "latest_water_level_m": latest_reading.get("water_level_m") if latest_reading else None,
                "latest_observed_at": latest_reading.get("observed_at") if latest_reading else None,
                "latest_risk_level": latest_evaluation.get("risk_level") if latest_evaluation else None,
                "village_count": village_count,
                "active_alerts": basin_active_alerts,
            }
        )

    role_counts = [{"role": role, "label": label, "count": 0} for role, label in ROLE_LABELS]
    role_map = {item["role"]: item for item in role_counts}
    profile_rows = _safe_rows("user_profiles", admin.table("user_profiles").select("role"), errors)
    for row in profile_rows:
        role = str(row.get("role") or "")
        if role in role_map:
            role_map[role]["count"] += 1

    freshness = []
    for label, table, column in (
        ("Latest hydro observation", "hydro_readings", "observed_at"),
        ("Latest sensor reading", "sensor_readings", "observed_at"),
        ("Latest community report", "community_reports", "submitted_at"),
        ("Latest rule evaluation", "rule_evaluations", "evaluated_at"),
        ("Latest alert record", "alerts", "created_at"),
        ("Latest delivery record", "alert_deliveries", "created_at"),
    ):
        row = _latest(table, column, column, errors)
        freshness.append({"label": label, "timestamp": row.get(column) if row else None})

    service_checks = [
        {
            "key": "fastapi",
            "label": "FastAPI command service",
            "status": "ok",
            "detail": "Administrative API responded successfully.",
        },
        {
            "key": "supabase",
            "label": "Supabase data access",
            "status": "attention" if errors else "ok",
            "detail": "Some data checks returned errors." if errors else "Core prototype tables are readable.",
        },
        {
            "key": "hydro",
            "label": "Hydrological data",
            "status": "ok" if metrics["hydro_stations"] and metrics["hydro_readings"] else "attention",
            "detail": f"{metrics['hydro_stations']} stations · {metrics['hydro_readings']} readings.",
        },
        {
            "key": "rules",
            "label": "Rule evaluation trail",
            "status": "ok" if metrics["rule_evaluations"] else "attention",
            "detail": f"{metrics['rule_evaluations']} persisted evaluations.",
        },
        {
            "key": "community",
            "label": "Community reporting path",
            "status": "ok" if not any(item.startswith("community_reports:") for item in errors) else "attention",
            "detail": f"{metrics['community_reports']} stored community reports.",
        },
        {
            "key": "delivery",
            "label": "Alert delivery records",
            "status": "ok" if not any(item.startswith("alert_deliveries:") for item in errors) else "attention",
            "detail": f"{metrics['alert_deliveries']} delivery records.",
        },
    ]

    return {
        "metrics": metrics,
        "service_checks": service_checks,
        "basins": basins,
        "role_counts": role_counts,
        "freshness": freshness,
        "source_errors": errors[:12],
    }
