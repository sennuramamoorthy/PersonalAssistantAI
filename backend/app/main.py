from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, oauth, dashboard, email, calendar, meetings, travel, chat

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(dashboard.router)
app.include_router(email.router)
app.include_router(calendar.router)
app.include_router(meetings.router)
app.include_router(travel.router)
app.include_router(chat.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
