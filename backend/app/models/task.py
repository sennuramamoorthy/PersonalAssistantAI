"""Task models — action items extracted from emails."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(20), default="normal")  # urgent, high, normal, low
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, in_progress, completed
    due_date: Mapped[str | None] = mapped_column(String(30), nullable=True)  # ISO date, nullable

    # Source email tracking
    source_email_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_email_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)  # google, microsoft
    source_email_subject: Mapped[str] = mapped_column(String(1000), default="")
    source_email_from: Mapped[str] = mapped_column(String(500), default="")

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_tasks_user_email", "user_id", "source_email_id"),
    )
