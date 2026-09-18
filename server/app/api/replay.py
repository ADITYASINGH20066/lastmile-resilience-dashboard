from fastapi import APIRouter, HTTPException

from app.schemas import ReplayRequest
from app.services.replay_service import replay_river

router = APIRouter(prefix="/demo", tags=["Demo"])


@router.post("/replay/{river_code}")
async def replay(river_code: str, payload: ReplayRequest):
    try:
        return await replay_river(
            river_code=river_code,
            station_code=payload.station_code,
            limit=payload.limit,
            delay_seconds=payload.delay_seconds,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
