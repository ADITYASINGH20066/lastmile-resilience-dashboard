from __future__ import annotations

from uuid import UUID

from app.db.supabase import get_admin_client


async def build_impact_assessment(event_id: UUID) -> list[dict]:
    admin = get_admin_client()
    event = admin.table("events").select("*").eq("id", str(event_id)).single().execute().data
    if not event or not event.get("basin_id"):
        return []

    villages = (
        admin.table("villages")
        .select("id,village_name,population,vulnerability_score,latitude,longitude")
        .eq("basin_id", event["basin_id"])
        .order("vulnerability_score", desc=True)
        .execute()
        .data
        or []
    )

    assessments = []
    for index, village in enumerate(villages):
        # Prototype approximation: downstream order is currently represented
        # by seeded village ordering. Replace with DEM/river graph calculation later.
        risk = max(35.0, 92.0 - index * 9.0)
        if risk >= 80:
            risk_level = "critical"
        elif risk >= 65:
            risk_level = "high"
        elif risk >= 50:
            risk_level = "moderate"
        else:
            risk_level = "low"

        eta = 15.0 + index * 15.0
        row = {
            "event_id": str(event_id),
            "village_id": village["id"],
            "risk_score": round(risk, 2),
            "risk_level": risk_level,
            "time_to_impact_minutes": eta,
            "hazard_path_distance_km": None,
            "downstream_order": index + 1,
            "population_at_risk": village.get("population"),
            "calculation_method": "prototype_downstream_order",
            "model_version": "demo-v1",
            "details": {
                "prototype": True,
                "note": "Replace with river/terrain graph and DEM-derived propagation in advanced phase",
            },
        }
        existing = (
            admin.table("impact_assessments")
            .select("id")
            .eq("event_id", str(event_id))
            .eq("village_id", str(village["id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            admin.table("impact_assessments").update(row).eq("id", existing[0]["id"]).execute()
        else:
            admin.table("impact_assessments").insert(row).execute()
        assessments.append(row)

    return assessments
