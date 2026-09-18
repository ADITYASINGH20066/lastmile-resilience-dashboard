from fastapi import Depends, Header, HTTPException, status

from app.db.supabase import get_admin_client, get_public_client


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token required",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty access token")

    try:
        public_client = get_public_client()
        auth_response = public_client.auth.get_user(token)
        user = auth_response.user
        if user is None:
            raise ValueError("Invalid user")
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token") from exc

    try:
        admin = get_admin_client()
        profile_response = (
            admin.table("user_profiles")
            .select("id,full_name,role,village_id,is_active")
            .eq("id", str(user.id))
            .maybe_single()
            .execute()
        )
        profile = profile_response.data
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to load user profile") from exc

    if not profile or not profile.get("is_active", True):
        raise HTTPException(status_code=403, detail="User profile is not active or does not exist")

    return {
        "id": str(user.id),
        "email": getattr(user, "email", None),
        "full_name": profile.get("full_name"),
        "role": profile.get("role"),
        "village_id": profile.get("village_id"),
    }


def require_roles(*allowed_roles: str):
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: one of {', '.join(allowed_roles)}",
            )
        return user

    return dependency
