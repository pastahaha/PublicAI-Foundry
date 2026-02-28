from fastapi import APIRouter
from src.core.models.base import HealthResponse
import contextlib
from src.core.database import db_manager
from sqlalchemy import text

health_router = APIRouter(tags=["health"])


@health_router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check health of all infrastructure components."""
    db_status = "unhealthy"
    checkpointer_status = "unhealthy"
    store_status = "unhealthy"

    # Check PostgreSQL (SQLAlchemy engine)
    with contextlib.suppress(Exception):
        if db_manager.engine:
            async with db_manager.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db_status = "healthy"

    with contextlib.suppress(Exception):
        if db_manager._checkpointer is not None:
            checkpointer_status = "healthy"

    with contextlib.suppress(Exception):
        if db_manager._store is not None:
            store_status = "healthy"

    overall = (
        "healthy"
        if all(s == "healthy" for s in [db_status, checkpointer_status, store_status])
        else "unhealthy"
    )

    return HealthResponse(
        status=overall,
        database=db_status,
        langgraph_checkpointer=checkpointer_status,
        langgraph_store=store_status,
    )
