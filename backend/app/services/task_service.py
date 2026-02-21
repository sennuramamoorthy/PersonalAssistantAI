"""Task service — CRUD, AI extraction from emails, deduplication."""

import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.task import Task
from app.models.user import User
from app.integrations.anthropic_client import extract_tasks_from_email


class TaskServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------

async def list_tasks(
    db: AsyncSession,
    user: User,
    status: str | None = None,
    priority: str | None = None,
) -> dict:
    """List tasks for a user, optionally filtered by status and/or priority."""
    query = (
        select(Task)
        .where(Task.user_id == user.id)
        .order_by(Task.created_at.desc())
    )
    if status:
        query = query.where(Task.status == status)
    if priority:
        query = query.where(Task.priority == priority)

    result = await db.execute(query)
    tasks = result.scalars().all()

    return {
        "tasks": [_serialize_task(t) for t in tasks],
        "total": len(tasks),
    }


async def get_task(db: AsyncSession, user: User, task_id: str) -> dict:
    """Get a single task."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise TaskServiceError("Task not found")
    return _serialize_task(task)


async def create_task(
    db: AsyncSession,
    user: User,
    title: str,
    description: str = "",
    priority: str = "normal",
    due_date: str | None = None,
    source_email_id: str | None = None,
    source_email_provider: str | None = None,
    source_email_subject: str = "",
    source_email_from: str = "",
) -> dict:
    """Create a new task."""
    task = Task(
        user_id=user.id,
        title=title,
        description=description,
        priority=priority,
        status="pending",
        due_date=due_date,
        source_email_id=source_email_id,
        source_email_provider=source_email_provider,
        source_email_subject=source_email_subject,
        source_email_from=source_email_from,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _serialize_task(task)


async def update_task(
    db: AsyncSession,
    user: User,
    task_id: str,
    updates: dict,
) -> dict:
    """Update task fields."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise TaskServiceError("Task not found")

    allowed_fields = {"title", "description", "priority", "status", "due_date"}
    for key, value in updates.items():
        if key in allowed_fields:
            setattr(task, key, value)

    # If status changed to completed, set completed_at
    if updates.get("status") == "completed" and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    # If status changed away from completed, clear completed_at
    if updates.get("status") and updates["status"] != "completed":
        task.completed_at = None

    await db.commit()
    await db.refresh(task)
    return _serialize_task(task)


async def complete_task(db: AsyncSession, user: User, task_id: str) -> dict:
    """Mark a task as completed."""
    return await update_task(db, user, task_id, {"status": "completed"})


async def delete_task(db: AsyncSession, user: User, task_id: str) -> dict:
    """Delete a task."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise TaskServiceError("Task not found")

    await db.delete(task)
    await db.commit()
    return {"status": "deleted"}


async def get_task_counts(db: AsyncSession, user: User) -> dict:
    """Get task counts by status for dashboard."""
    result = await db.execute(
        select(Task.status, func.count(Task.id))
        .where(Task.user_id == user.id)
        .group_by(Task.status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    return {
        "pending": counts.get("pending", 0),
        "in_progress": counts.get("in_progress", 0),
        "completed": counts.get("completed", 0),
        "total": sum(counts.values()),
    }


# ---------------------------------------------------------------------------
# Email scanning for tasks
# ---------------------------------------------------------------------------

TASK_SEARCH_QUERY = "action OR request OR please OR deadline OR meeting OR review OR approve OR submit OR follow up"


async def _has_tasks_for_email(
    db: AsyncSession, user: User, email_id: str
) -> bool:
    """Check if tasks already exist for a given email (deduplication)."""
    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.user_id == user.id,
            Task.source_email_id == email_id,
        )
    )
    count = result.scalar() or 0
    return count > 0


async def scan_emails_for_tasks(
    db: AsyncSession,
    user: User,
    query: str = "",
    page_size: int = 30,
) -> dict:
    """Scan recent emails for action items and return task suggestions."""
    from app.services.email_service import get_inbox

    search_query = query or TASK_SEARCH_QUERY
    inbox = await get_inbox(db, user, query=search_query, page_size=page_size)
    emails = inbox.get("emails", [])

    # Fallback: scan all recent emails if keyword search returned nothing
    if not emails and not query:
        inbox = await get_inbox(db, user, page_size=page_size)
        emails = inbox.get("emails", [])

    if not emails:
        return {"suggestions": [], "emails_scanned": 0, "tasks_found": 0, "skipped_already_scanned": 0}

    # Filter out emails we already have tasks for (deduplication)
    emails_to_scan = []
    for email in emails:
        email_id = email.get("id", "")
        if email_id and await _has_tasks_for_email(db, user, email_id):
            continue
        emails_to_scan.append(email)

    if not emails_to_scan:
        return {
            "suggestions": [],
            "emails_scanned": len(emails),
            "tasks_found": 0,
            "skipped_already_scanned": len(emails),
        }

    # Run AI extraction in parallel with concurrency limit
    semaphore = asyncio.Semaphore(5)

    async def _extract(email: dict) -> dict | None:
        async with semaphore:
            try:
                tasks = await extract_tasks_from_email(
                    from_addr=email.get("from", ""),
                    subject=email.get("subject", ""),
                    body=(email.get("body") or email.get("snippet", ""))[:3000],
                    date=email.get("date", ""),
                )
                if tasks:
                    return {
                        "email_id": email.get("id", ""),
                        "email_provider": email.get("provider", ""),
                        "email_subject": email.get("subject", ""),
                        "email_from": email.get("from", ""),
                        "email_date": email.get("date", ""),
                        "tasks": tasks,
                    }
            except Exception:
                pass
            return None

    results = await asyncio.gather(*[_extract(e) for e in emails_to_scan])

    suggestions = [r for r in results if r is not None]
    total_tasks = sum(len(s["tasks"]) for s in suggestions)

    return {
        "suggestions": suggestions,
        "emails_scanned": len(emails),
        "tasks_found": total_tasks,
        "skipped_already_scanned": len(emails) - len(emails_to_scan),
    }


async def approve_task_suggestions(
    db: AsyncSession,
    user: User,
    suggestion: dict,
) -> list[dict]:
    """Create tasks from an approved email task suggestion."""
    email_id = suggestion.get("email_id", "")
    email_provider = suggestion.get("email_provider", "")
    email_subject = suggestion.get("email_subject", "")
    email_from = suggestion.get("email_from", "")

    # Dedup check: if tasks already exist for this email, skip
    if email_id and await _has_tasks_for_email(db, user, email_id):
        raise TaskServiceError("Tasks already created from this email")

    created_tasks = []
    for task_data in suggestion.get("tasks", []):
        task = await create_task(
            db,
            user,
            title=task_data.get("title", "Untitled Task"),
            description=task_data.get("description", ""),
            priority=task_data.get("priority", "normal"),
            due_date=task_data.get("suggested_due_date"),
            source_email_id=email_id,
            source_email_provider=email_provider,
            source_email_subject=email_subject,
            source_email_from=email_from,
        )
        created_tasks.append(task)

    return created_tasks


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

def _serialize_task(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "due_date": task.due_date,
        "source_email_id": task.source_email_id,
        "source_email_provider": task.source_email_provider,
        "source_email_subject": task.source_email_subject,
        "source_email_from": task.source_email_from,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }
