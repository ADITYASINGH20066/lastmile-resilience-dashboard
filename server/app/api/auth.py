from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
