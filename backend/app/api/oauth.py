"""OAuth2 connection endpoints for Google and Microsoft accounts."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, create_access_token, decode_token
from app.core.encryption import encrypt_token
from app.models.user import User
from app.models.oauth_token import OAuthToken
from app.integrations.gmail import (
    get_google_auth_url,
    exchange_google_code,
    GOOGLE_SCOPES,
)
from app.integrations.microsoft_graph import (
    get_microsoft_auth_url,
    exchange_microsoft_code,
    MICROSOFT_SCOPES,
)

router = APIRouter(prefix="/api/oauth", tags=["oauth"])


# --- Google OAuth ---

@router.get("/google/authorize")
async def google_authorize(user: User = Depends(get_current_user)):
    """Get Google OAuth2 authorization URL. Frontend redirects user here."""
    redirect_uri = f"{settings.frontend_url}/api/oauth/google/callback"
    # Use a short-lived token as state to identify user on callback
    state = create_access_token(user.id)
    auth_url = get_google_auth_url(redirect_uri, state)
    return {"auth_url": auth_url}


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth2 callback — exchanges code for tokens and stores them."""
    # Decode state to get user ID
    payload = decode_token(state)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    redirect_uri = f"{settings.frontend_url}/api/oauth/google/callback"

    try:
        tokens = await exchange_google_code(code, redirect_uri)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to exchange code: {e}")

    # Delete any existing Google token for this user
    await db.execute(
        delete(OAuthToken).where(
            OAuthToken.user_id == user_id, OAuthToken.provider == "google"
        )
    )

    # Store encrypted tokens
    expiry = None
    if "expires_in" in tokens:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])

    oauth_token = OAuthToken(
        user_id=user_id,
        provider="google",
        access_token_encrypted=encrypt_token(tokens["access_token"]),
        refresh_token_encrypted=encrypt_token(tokens.get("refresh_token", "")),
        token_expiry=expiry,
        scopes=" ".join(GOOGLE_SCOPES),
    )
    db.add(oauth_token)

    # Update user flag
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.google_connected = True

    await db.commit()

    # Redirect back to frontend settings page
    return RedirectResponse(url=f"{settings.frontend_url}/dashboard/settings?connected=google")


# --- Microsoft OAuth ---

@router.get("/microsoft/authorize")
async def microsoft_authorize(user: User = Depends(get_current_user)):
    """Get Microsoft OAuth2 authorization URL."""
    redirect_uri = f"{settings.frontend_url}/api/oauth/microsoft/callback"
    state = create_access_token(user.id)
    auth_url = get_microsoft_auth_url(redirect_uri, state)
    return {"auth_url": auth_url}


@router.get("/microsoft/callback")
async def microsoft_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Microsoft OAuth2 callback."""
    payload = decode_token(state)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    redirect_uri = f"{settings.frontend_url}/api/oauth/microsoft/callback"

    try:
        tokens = await exchange_microsoft_code(code, redirect_uri)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to exchange code: {e}")

    # Delete any existing Microsoft token
    await db.execute(
        delete(OAuthToken).where(
            OAuthToken.user_id == user_id, OAuthToken.provider == "microsoft"
        )
    )

    expiry = None
    if "expires_in" in tokens:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])

    oauth_token = OAuthToken(
        user_id=user_id,
        provider="microsoft",
        access_token_encrypted=encrypt_token(tokens["access_token"]),
        refresh_token_encrypted=encrypt_token(tokens.get("refresh_token", "")),
        token_expiry=expiry,
        scopes=" ".join(MICROSOFT_SCOPES),
    )
    db.add(oauth_token)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.microsoft_connected = True

    await db.commit()

    return RedirectResponse(url=f"{settings.frontend_url}/dashboard/settings?connected=microsoft")


# --- Disconnect ---

class DisconnectRequest(BaseModel):
    provider: str  # "google" or "microsoft"


@router.post("/disconnect")
async def disconnect_provider(
    body: DisconnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect a Google or Microsoft account."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")

    await db.execute(
        delete(OAuthToken).where(
            OAuthToken.user_id == user.id, OAuthToken.provider == body.provider
        )
    )

    if body.provider == "google":
        user.google_connected = False
    else:
        user.microsoft_connected = False

    await db.commit()

    return {"status": "disconnected", "provider": body.provider}


@router.get("/status")
async def oauth_status(user: User = Depends(get_current_user)):
    """Get the connection status of all OAuth providers."""
    return {
        "google": user.google_connected,
        "microsoft": user.microsoft_connected,
    }
