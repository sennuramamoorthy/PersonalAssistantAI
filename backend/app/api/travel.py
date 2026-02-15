"""Travel API endpoints — trip management, segments, documents, calendar blocking."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.travel_service import (
    list_trips,
    get_trip,
    create_trip,
    update_trip,
    delete_trip,
    add_segment,
    delete_segment,
    add_document,
    delete_document,
    block_calendar_for_trip,
    check_travel_conflicts,
    ai_travel_summary,
    TravelServiceError,
)

router = APIRouter(prefix="/api/travel", tags=["travel"])


# --- Schemas ---

class CreateTripRequest(BaseModel):
    title: str
    destination: str
    start_date: str  # ISO date
    end_date: str
    notes: str = ""


class UpdateTripRequest(BaseModel):
    title: str | None = None
    destination: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    notes: str | None = None
    status: str | None = None


class AddSegmentRequest(BaseModel):
    segment_type: str  # flight, hotel, car_rental, train, other
    title: str
    start_time: str
    end_time: str
    location_from: str = ""
    location_to: str = ""
    confirmation_number: str = ""
    carrier: str = ""
    details: str = ""
    cost: float | None = None
    currency: str = "USD"


class AddDocumentRequest(BaseModel):
    name: str
    doc_type: str = "other"
    file_url: str = ""
    notes: str = ""


class CalendarBlockRequest(BaseModel):
    provider: str  # google or microsoft


# --- Trip Routes ---

@router.get("/trips")
async def api_list_trips(
    status: str | None = Query(None, description="Filter by status: upcoming, in_progress, completed, cancelled"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all trips for the current user."""
    return await list_trips(db, user, status=status)


@router.get("/trips/{trip_id}")
async def api_get_trip(
    trip_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single trip with all details."""
    try:
        return await get_trip(db, user, trip_id)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/trips")
async def api_create_trip(
    body: CreateTripRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new trip."""
    return await create_trip(
        db, user,
        title=body.title,
        destination=body.destination,
        start_date=body.start_date,
        end_date=body.end_date,
        notes=body.notes,
    )


@router.put("/trips/{trip_id}")
async def api_update_trip(
    trip_id: str,
    body: UpdateTripRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a trip."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        return await update_trip(db, user, trip_id, updates)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/trips/{trip_id}")
async def api_delete_trip(
    trip_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a trip."""
    try:
        return await delete_trip(db, user, trip_id)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Segment Routes ---

@router.post("/trips/{trip_id}/segments")
async def api_add_segment(
    trip_id: str,
    body: AddSegmentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a segment (flight, hotel, etc.) to a trip."""
    valid_types = {"flight", "hotel", "car_rental", "train", "other"}
    if body.segment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid segment_type. Use: {', '.join(valid_types)}")
    try:
        return await add_segment(
            db, user, trip_id,
            segment_type=body.segment_type,
            title=body.title,
            start_time=body.start_time,
            end_time=body.end_time,
            location_from=body.location_from,
            location_to=body.location_to,
            confirmation_number=body.confirmation_number,
            carrier=body.carrier,
            details=body.details,
            cost=body.cost,
            currency=body.currency,
        )
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/trips/{trip_id}/segments/{segment_id}")
async def api_delete_segment(
    trip_id: str,
    segment_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a segment from a trip."""
    try:
        return await delete_segment(db, user, trip_id, segment_id)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Document Routes ---

@router.post("/trips/{trip_id}/documents")
async def api_add_document(
    trip_id: str,
    body: AddDocumentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a document to a trip."""
    valid_types = {"boarding_pass", "hotel_confirmation", "visa", "insurance", "itinerary", "other"}
    if body.doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type. Use: {', '.join(valid_types)}")
    try:
        return await add_document(
            db, user, trip_id,
            name=body.name,
            doc_type=body.doc_type,
            file_url=body.file_url,
            notes=body.notes,
        )
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/trips/{trip_id}/documents/{doc_id}")
async def api_delete_document(
    trip_id: str,
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a document from a trip."""
    try:
        return await delete_document(db, user, trip_id, doc_id)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Calendar & Conflicts ---

@router.post("/trips/{trip_id}/block-calendar")
async def api_block_calendar(
    trip_id: str,
    body: CalendarBlockRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block calendar time for a trip."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        return await block_calendar_for_trip(db, user, trip_id, body.provider)
    except TravelServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trips/{trip_id}/conflicts")
async def api_check_conflicts(
    trip_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check for calendar conflicts during a trip."""
    try:
        return await check_travel_conflicts(db, user, trip_id)
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- AI ---

@router.get("/trips/{trip_id}/summary")
async def api_trip_summary(
    trip_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get an AI-generated travel summary and checklist."""
    try:
        trip_data = await get_trip(db, user, trip_id)
        summary = await ai_travel_summary(trip_data)
        return {"trip_id": trip_id, "summary": summary}
    except TravelServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
