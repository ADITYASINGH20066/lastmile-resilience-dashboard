from __future__ import annotations

from uuid import UUID

from app.db.supabase import get_admin_client
from app.services.impact_engine import build_impact_assessment
from app.services.rule_engine import evaluate_hydro_reading


async def replay_river(river_code: str, station_code: str | None, limit: int, delay_seconds: float) -> dict:
    admin = get_admin_client()

    basin = (
        admin.table("basins")
        .select("id,basin_code,basin_name,river_system")
        .eq("basin_code", river_code.upper())
        .single()
        .execute()
        .data
    )
    if not basin:
        raise ValueError("River/basin not found")

    if station_code:
        clean_station_code = station_code.strip().casefold()

    # Get all stations belonging to the requested basin.
    # We compare station codes in Python so whitespace/case differences
    # in the database cannot prevent a match.
        basin_stations = (
        admin.table("hydro_stations")
        .select("*")
        .eq("basin_id", basin["id"])
        .order("station_name")
        .execute()
        .data
        or []
        )

        station = next(
        (
            s
            for s in basin_stations
            if str(s.get("station_code", "")).strip().casefold()
            == clean_station_code
        ),
        None,
        )

        if station is None:
            available = [
            str(s.get("station_code", "")).strip()
            for s in basin_stations
            ]
            raise ValueError(
            f"Station '{station_code}' not found in river "
            f"'{river_code.upper()}'. Available stations: {available}"
            )

    else:
        stations = (
        admin.table("hydro_stations")
        .select("*")
        .eq("basin_id", basin["id"])
        .order("station_name")
        .limit(1)
        .execute()
        .data
        or []
        )

        if not stations:
            raise ValueError("No hydro station found for this river")

        station = stations[0]

    readings = (
        admin.table("hydro_readings")
        .select("*")
        .eq("station_id", station["id"])
        .eq("data_mode", "historical")
        .order("observed_at")
        .limit(limit)
        .execute()
        .data
        or []
    )
    if not readings:
        raise ValueError("No historical readings available for this station")

    results = []
    first_alert = None
    for reading in readings:
        result = evaluate_hydro_reading(reading, create_alert=True)
        results.append({
            "reading_id": reading["id"],
            "observed_at": reading["observed_at"],
            "water_level_m": reading.get("water_level_m"),
            "rate_m_hr": reading.get("water_level_rate_m_hr"),
            "score": result["total_score"],
            "risk_level": result["risk_level"],
            "alert_recommended": result["alert_recommended"],
            "alert_id": (result.get("alert") or {}).get("id"),
            "reasons": result["reasons"],
        })
        if result.get("alert") and not first_alert:
            first_alert = result["alert"]
            await build_impact_assessment(UUID(result["event"]["id"]))

    return {
        "river": basin,
        "station": station,
        "mode": "historical_replay",
        "delay_seconds": delay_seconds,
        "steps": results,
        "alert": first_alert,
        "note": "Historical observations are replayed for demonstration; they are not live CWC readings.",
    }
