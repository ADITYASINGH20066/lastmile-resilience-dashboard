from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import require_roles
from app.db.supabase import get_admin_client
from app.schemas import CommunityReportCreate
from app.services.rule_engine import evaluate_community_report

router = APIRouter(prefix="/community", tags=["Community"])


@router.get("/options")
async def report_options():
    return {
        "rivers": [
            {"code": "TEESTA", "name": "Teesta"},
            {"code": "DESANG", "name": "Desang"},
        ],
        "report_types": [
            {"value": "flood", "label": "Flood / water entering area"},
            {"value": "water_rise", "label": "River water rising rapidly"},
            {"value": "landslide", "label": "Landslide"},
            {"value": "avalanche", "label": "Avalanche"},
            {
                "value": "damaged_infrastructure",
                "label": "Damaged road / bridge / infrastructure",
            },
            {"value": "blocked_route", "label": "Road / route blocked"},
            {"value": "unusual_sound", "label": "Unusual sound / vibration"},
            {"value": "other", "label": "Other observation"},
        ],
        "severity_levels": [
            {"value": "low", "label": "Low"},
            {"value": "moderate", "label": "Moderate"},
            {"value": "high", "label": "High"},
            {"value": "critical", "label": "Critical"},
        ],
    }


@router.post("/reports")
async def create_report(
    payload: CommunityReportCreate,
    user: dict = Depends(
        require_roles(
            "community_member",
            "village_authority",
            "control_room",
            "admin",
        )
    ),
):
    admin = get_admin_client()

    station = (
        admin.table("hydro_stations")
        .select("id,basin_id,station_name,river_name")
        .eq("id", str(payload.station_id))
        .maybe_single()
        .execute()
        .data
    )

    if not station:
        raise HTTPException(
            status_code=404,
            detail="Selected station not found",
        )

    if user["role"] == "village_authority":
        if not user.get("village_id"):
            raise HTTPException(
                status_code=403,
                detail="Village Authority account is not assigned to a village",
            )
        if payload.village_id and str(payload.village_id) != str(user["village_id"]):
            raise HTTPException(
                status_code=403,
                detail="Village Authority may submit reports only for its assigned village",
            )
        village_id = str(user["village_id"])
    else:
        village_id = (
            str(payload.village_id)
            if payload.village_id
            else user.get("village_id")
        )

        if (
            user["role"] == "community_member"
            and user.get("village_id")
            and village_id != user["village_id"]
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Community members may submit reports only "
                    "for their registered village"
                ),
            )

    if not village_id:
        raise HTTPException(
            status_code=400,
            detail="village_id is required for this report",
        )

    now = datetime.now(timezone.utc).isoformat()

    report_code = (
        f"CR-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-"
        f"{str(user['id'])[:8]}"
    )

    report_response = (
        admin.table("community_reports")
        .insert(
            {
                "report_code": report_code,
                "village_id": village_id,
                "station_id": str(payload.station_id),
                "submitted_at": now,
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "report_type": payload.report_type,
                "description": payload.description,
                "severity": payload.severity,
                "multimedia_url": payload.multimedia_url,
                "reporter_user_id": user["id"],
                "verification_status": "pending",
                "trust_score": None,
                "metadata": payload.metadata,
            }
        )
        .select("*")
        .execute()
    )

    if not report_response.data:
        raise ValueError("Failed to create community report")

    row = report_response.data[0]

    evaluation = evaluate_community_report(row)

    return {
        "report": row,
        "evaluation": evaluation,
    }


@router.get("/reports/recent")
async def recent_reports(
    limit: int = 20,
    user: dict = Depends(
        require_roles(
            "control_room",
            "disaster_authority",
            "admin",
        )
    ),
):
    del user

    rows = (
        get_admin_client()
        .table("community_reports")
        .select(
            "id,report_code,village_id,station_id,submitted_at,"
            "latitude,longitude,report_type,description,severity,"
            "multimedia_url,verification_status,trust_score,metadata"
        )
        .order("submitted_at", desc=True)
        .limit(min(limit, 100))
        .execute()
        .data
        or []
    )

    return {"items": rows}