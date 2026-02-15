"""Travel models — trips, segments (flights, hotels, transport), and documents."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    destination: Mapped[str] = mapped_column(String(500), nullable=False)
    start_date: Mapped[str] = mapped_column(String(30), nullable=False)  # ISO date
    end_date: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="upcoming")  # upcoming, in_progress, completed, cancelled
    notes: Mapped[str] = mapped_column(Text, default="")
    calendar_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    segments: Mapped[list["TripSegment"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="TripSegment.start_time"
    )
    documents: Mapped[list["TripDocument"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class TripSegment(Base):
    """A segment of a trip — flight, hotel stay, ground transport, etc."""
    __tablename__ = "trip_segments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_id: Mapped[str] = mapped_column(String(36), ForeignKey("trips.id"), nullable=False, index=True)
    segment_type: Mapped[str] = mapped_column(String(30), nullable=False)  # flight, hotel, car_rental, train, other
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    start_time: Mapped[str] = mapped_column(String(30), nullable=False)  # ISO datetime
    end_time: Mapped[str] = mapped_column(String(30), nullable=False)
    location_from: Mapped[str] = mapped_column(String(500), default="")
    location_to: Mapped[str] = mapped_column(String(500), default="")
    confirmation_number: Mapped[str] = mapped_column(String(200), default="")
    carrier: Mapped[str] = mapped_column(String(200), default="")  # airline, hotel chain, etc.
    details: Mapped[str] = mapped_column(Text, default="")  # JSON or free text with extra info
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    trip: Mapped["Trip"] = relationship(back_populates="segments")


class TripDocument(Base):
    """Documents attached to a trip — boarding passes, confirmations, etc."""
    __tablename__ = "trip_documents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_id: Mapped[str] = mapped_column(String(36), ForeignKey("trips.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), default="other")  # boarding_pass, hotel_confirmation, visa, insurance, other
    file_url: Mapped[str] = mapped_column(String(1000), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    trip: Mapped["Trip"] = relationship(back_populates="documents")
