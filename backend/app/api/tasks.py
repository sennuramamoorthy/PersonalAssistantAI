"""Task API endpoints — task management and email scanning for action items."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.task_service import (
    list_tasks,
    get_task,
    create_task,
    update_task,
    complete_task,
    delete_task,
    get_task_counts,
    scan_emails_for_tasks,
    approve_task_suggestions,
    TaskServiceError,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    priority: str = "normal"
    due_date: str | None = None


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    due_date: str | None = None


class ScanEmailsForTasksRequest(BaseModel):
    query: str = ""
    page_size: int = 30


class TaskSuggestionItem(BaseModel):
    title: str
    description: str = ""
    priority: str = "normal"
    suggested_due_date: str | None = None


class TaskSuggestion(BaseModel):
    email_id: str
    email_provider: str
    email_subject: str = ""
    email_from: str = ""
    email_date: str = ""
    tasks: list[TaskSuggestionItem]


class ApproveTaskSuggestionRequest(BaseModel):
    suggestion: TaskSuggestion


# ---------------------------------------------------------------------------
# Task CRUD Routes
# ---------------------------------------------------------------------------

@router.get("/")
async def api_list_tasks(
    status: str | None = Query(None, description="Filter: pending, in_progress, completed"),
    priority: str | None = Query(None, description="Filter: urgent, high, normal, low"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks for the current user."""
    return await list_tasks(db, user, status=status, priority=priority)


@router.get("/counts")
async def api_task_counts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get task counts by status."""
    return await get_task_counts(db, user)


@router.get("/{task_id}")
async def api_get_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single task."""
    try:
        return await get_task(db, user, task_id)
    except TaskServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/")
async def api_create_task(
    body: CreateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task manually."""
    valid_priorities = {"urgent", "high", "normal", "low"}
    if body.priority not in valid_priorities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Use: {', '.join(valid_priorities)}",
        )
    return await create_task(
        db,
        user,
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.due_date,
    )


@router.put("/{task_id}")
async def api_update_task(
    task_id: str,
    body: UpdateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "status" in updates:
        valid_statuses = {"pending", "in_progress", "completed"}
        if updates["status"] not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Use: {', '.join(valid_statuses)}",
            )
    if "priority" in updates:
        valid_priorities = {"urgent", "high", "normal", "low"}
        if updates["priority"] not in valid_priorities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid priority. Use: {', '.join(valid_priorities)}",
            )
    try:
        return await update_task(db, user, task_id, updates)
    except TaskServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{task_id}/complete")
async def api_complete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a task as completed."""
    try:
        return await complete_task(db, user, task_id)
    except TaskServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{task_id}")
async def api_delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task."""
    try:
        return await delete_task(db, user, task_id)
    except TaskServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Email Scanning
# ---------------------------------------------------------------------------

@router.post("/scan-emails")
async def api_scan_emails_for_tasks(
    body: ScanEmailsForTasksRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scan recent emails for action items and return task suggestions."""
    return await scan_emails_for_tasks(db, user, query=body.query, page_size=body.page_size)


@router.post("/approve-suggestion")
async def api_approve_task_suggestion(
    body: ApproveTaskSuggestionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create tasks from an approved email scan suggestion."""
    try:
        tasks = await approve_task_suggestions(db, user, body.suggestion.model_dump())
        return {"tasks": tasks, "created": len(tasks)}
    except TaskServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
