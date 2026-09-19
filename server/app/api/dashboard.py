from fastapi import APIRouter

from app.db.supabase import get_admin_client

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def summary():
    admin = get_admin_client()

    stations = admin.table("hydro_stations").select("id,station_code,station_name,river_name,district,state,latitude,longitude,warning_level_m,danger_level_m,highest_flood_level_m").in_("station_code", ["CWC_MELLI", "CWC_NANGLAMORAGHAT"]).execute().data or []

    latest = []
    for station in stations:
        readings = (
            admin.table("hydro_readings")
            .select("*")
            .eq("station_id", station["id"])
            .order("observed_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        latest.append({"station": station, "latest_reading": readings[0] if readings else None})

    recent_evaluations = (
        admin.table("rule_evaluations")
        .select("id,hydro_reading_id,sensor_reading_id,community_report_id,event_id,engine_version,level_score,rate_score,sensor_score,community_score,persistence_score,total_score,risk_level,alert_recommended,alert_priority,reasons,evaluated_at")
        .order("evaluated_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )

    active_alerts = (
        admin.table("alerts")
        .select("id,alert_code,title,description,instruction,priority,urgency,severity,certainty,status,created_at,event_id")
        .in_("status", ["pending_approval", "approved", "dispatching", "active"])
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )

    return {
        "stations": latest,
        "recent_evaluations": recent_evaluations,
        "active_alerts": active_alerts,
    }
