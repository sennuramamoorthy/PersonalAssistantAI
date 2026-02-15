"""Dashboard API endpoints — stats, briefing, pending actions."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.dashboard_service import (
    get_dashboard_stats,
    get_pending_actions,
    generate_ai_briefing,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def api_get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics."""
    return await get_dashboard_stats(db, user)


@router.get("/actions")
async def api_get_actions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get pending action items."""
    actions = await get_pending_actions(db, user)
    return {"actions": actions, "total": len(actions)}


@router.get("/briefing")
async def api_get_briefing(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI-generated daily briefing."""
    briefing = await generate_ai_briefing(db, user)
    return {
        "briefing": briefing,
        "user_name": user.full_name,
    }
