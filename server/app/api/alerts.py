from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user, require_roles
from app.db.supabase import get_admin_client
from app.schemas import ApprovalCreate
from app.services.alert_service import approve_alert
from app.services.impact_engine import build_impact_assessment

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/active")
async def active_alerts():
    rows = (
        get_admin_client()
        .table("alerts")
        .select("*")
        .in_(
            "status",
            [
                "pending_approval",
                "approved",
                "dispatching",
                "active",
            ],
        )
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )

    return {"items": rows}


@router.get("/{alert_id}")
async def get_alert(alert_id: UUID):
    admin = get_admin_client()

    alert = (
        admin.table("alerts")
        .select("*")
        .eq("id", str(alert_id))
        .maybe_single()
        .execute()
        .data
    )

    if not alert:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    targets = (
        admin.table("alert_targets")
        .select("*")
        .eq("alert_id", str(alert_id))
        .execute()
        .data
        or []
    )

    deliveries = (
        admin.table("alert_deliveries")
        .select("*")
        .eq("alert_id", str(alert_id))
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    return {
        "alert": alert,
        "targets": targets,
        "deliveries": deliveries,
    }


@router.post("/{alert_id}/impact")
async def build_impact(
    alert_id: UUID,
    user: dict = Depends(
        require_roles(
            "control_room",
            "disaster_authority",
            "admin",
        )
    ),
):
    del user

    alert = (
        get_admin_client()
        .table("alerts")
        .select("event_id")
        .eq("id", str(alert_id))
        .maybe_single()
        .execute()
        .data
    )

    if not alert:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    items = await build_impact_assessment(
        UUID(alert["event_id"])
    )

    return {"items": items}


@router.post("/{alert_id}/approve")
async def approve(
    alert_id: UUID,
    payload: ApprovalCreate,
    user: dict = Depends(get_current_user),
):
    if user.get("role") not in {
        "control_room",
        "disaster_authority",
        "admin",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only authorized control-room/disaster roles "
                "can approve public alert dispatch"
            ),
        )

    try:
        return await approve_alert(
            alert_id,
            user,
            payload.comments,
        )

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc