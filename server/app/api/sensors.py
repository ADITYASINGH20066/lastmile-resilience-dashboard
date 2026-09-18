from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.db.supabase import get_admin_client
from app.schemas import SensorReadingCreate
from app.services.rule_engine import evaluate_sensor_reading

router = APIRouter(prefix="/sensors", tags=["Sensors"])


@router.post("/readings")
async def create_sensor_reading(
    payload: SensorReadingCreate,
    x_sensor_key: str | None = Header(default=None),
):
    settings = get_settings()

    if settings.sensor_ingest_key and x_sensor_key != settings.sensor_ingest_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid sensor ingestion key",
        )

    admin = get_admin_client()

    # Find existing sensor device.
    devices = (
        admin.table("sensor_devices")
        .select("*")
        .eq("sensor_code", payload.sensor_code)
        .limit(1)
        .execute()
        .data
        or []
    )

    if devices:
        device = devices[0]
    else:
        # Create the sensor device if it does not exist.
        device_response = (
            admin.table("sensor_devices")
            .insert(
                {
                    "sensor_code": payload.sensor_code,
                    "sensor_type": payload.sensor_type,
                    "unit": payload.unit,
                    "is_simulated": True,
                    "is_active": True,
                    "metadata": {
                        "created_by": "sensor_ingestion_api"
                    },
                }
            )
            .select("*")
            .execute()
        )

        if not device_response.data:
            raise ValueError("Failed to create sensor device")

        device = device_response.data[0]

    # Prepare raw sensor metadata.
    now = datetime.now(timezone.utc).isoformat()

    raw_data = dict(payload.metadata)
    raw_data.update(
        {
            "station_id": (
                str(payload.station_id)
                if payload.station_id
                else None
            ),
            "sensor_code": payload.sensor_code,
        }
    )

    # Insert the actual sensor reading.
    reading_response = (
        admin.table("sensor_readings")
        .insert(
            {
                "sensor_id": device["id"],
                "observed_at": now,
                "numeric_value": payload.numeric_value,
                "unit": payload.unit,
                "battery_percentage": payload.battery_percentage,
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "quality_score": payload.metadata.get("quality_score"),
                "raw_data": raw_data,
            }
        )
        .select("*")
        .execute()
    )

    if not reading_response.data:
        raise ValueError("Failed to create sensor reading")

    row = reading_response.data[0]

    # Evaluate the sensor reading using the same rule engine.
    evaluation = None

    if payload.station_id:
        evaluation = evaluate_sensor_reading(
            row,
            payload.station_id,
        )

    return {
        "reading": row,
        "evaluation": evaluation,
    }