import logging
from uuid import uuid4
from pytz import UTC
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime
from src.core.models.assistant import (
    AssistantResponse,
    CreateAssistantRequest,
    UpdateAssistantRequest,
)
from src.core.orm import Assistant as AssistantORM
from src.core.orm import get_session

logger = logging.getLogger(__name__)

assistant_router = APIRouter(prefix="/assistant", tags=["assistant"])


def _orm_to_response(a: AssistantORM) -> AssistantResponse:
    return AssistantResponse(
        assistant_id=a.assistant_id,
        name=a.name,
        description=a.description,
        config=a.config or {},
        metadata=a.metadata_json or {},
        version=a.version,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


@assistant_router.post("/", response_model=AssistantResponse, status_code=201)
async def create_assistant(
    body: CreateAssistantRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Create a new assistant.

    The `config` field stores the full agent configuration (model, system prompt,
    tools, temperature, etc.). This is the blueprint that will be compiled into
    a LangGraph graph at runtime.
    """
    assistant_id = body.assistant_id or str(uuid4())
    now = datetime.now(UTC)

    # Idempotent: if already exists, return it
    existing = await session.get(AssistantORM, assistant_id)
    if existing:
        return _orm_to_response(existing)

    assistant = AssistantORM(
        assistant_id=assistant_id,
        name=body.name,
        description=body.description,
        config=body.config.model_dump(),
        metadata_json=body.metadata or {},
        version=1,
        user_id=user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)

    logger.info(f"Created assistant {assistant_id}: {body.name} (user={user_id})")
    return _orm_to_response(assistant)


@assistant_router.get("/", response_model=list[AssistantResponse])
async def list_assistants(
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """List all assistants for the current user."""
    result = await session.execute(
        select(AssistantORM)
        .where(AssistantORM.user_id == user_id)
        .order_by(AssistantORM.updated_at.desc())
    )
    assistants = result.scalars().all()
    return [_orm_to_response(a) for a in assistants]


@assistant_router.get("/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Get an assistant by ID."""
    assistant = await session.get(AssistantORM, assistant_id)
    if not assistant:
        raise HTTPException(
            status_code=404, detail=f"Assistant {assistant_id} not found"
        )
    return _orm_to_response(assistant)


@assistant_router.patch("/{assistant_id}", response_model=AssistantResponse)
async def update_assistant(
    assistant_id: str,
    body: UpdateAssistantRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Update an assistant (partial update). Increments the version."""
    assistant = await session.get(AssistantORM, assistant_id)
    if not assistant:
        raise HTTPException(
            status_code=404, detail=f"Assistant {assistant_id} not found"
        )

    now = datetime.now(UTC)
    updates: dict = {"updated_at": now, "version": assistant.version + 1}

    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if body.config is not None:
        updates["config"] = body.config.model_dump()
    if body.metadata is not None:
        updates["metadata_json"] = body.metadata

    await session.execute(
        update(AssistantORM)
        .where(AssistantORM.assistant_id == assistant_id)
        .values(**updates)
    )
    await session.commit()

    # Re-fetch to return updated state
    await session.refresh(assistant)
    logger.info(f"Updated assistant {assistant_id} to v{assistant.version}")
    return _orm_to_response(assistant)


@assistant_router.delete("/{assistant_id}", status_code=204)
async def delete_assistant(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Delete an assistant. Runs referencing this assistant will have assistant_id set to NULL."""
    assistant = await session.get(AssistantORM, assistant_id)
    if not assistant:
        raise HTTPException(
            status_code=404, detail=f"Assistant {assistant_id} not found"
        )
    await session.delete(assistant)
    await session.commit()
    logger.info(f"Deleted assistant {assistant_id}")
