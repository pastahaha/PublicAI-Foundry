"""SQLAlchemy ORM models for Voxket Sphere.

Tables: Assistant, Thread, Run, RunEvent
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, declarative_base, mapped_column

Base = declarative_base()


class Assistant(Base):
    __tablename__ = "assistant"

    assistant_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    metadata_json: Mapped[dict] = mapped_column(
        "metadata_json", JSONB, server_default=text("'{}'::jsonb")
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    user_id: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'system'")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    __table_args__ = (Index("idx_assistant_user", "user_id"),)


class Thread(Base):
    __tablename__ = "thread"

    thread_id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text, server_default=text("'idle'"))
    metadata_json: Mapped[dict] = mapped_column(
        "metadata_json", JSONB, server_default=text("'{}'::jsonb")
    )
    user_id: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'system'")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    __table_args__ = (Index("idx_thread_user", "user_id"),)


class Run(Base):
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(Text, primary_key=True)
    thread_id: Mapped[str] = mapped_column(
        Text, ForeignKey("thread.thread_id", ondelete="CASCADE"), nullable=False
    )
    assistant_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("assistant.assistant_id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    input: Mapped[dict | None] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'system'")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    __table_args__ = (
        Index("idx_runs_thread_id", "thread_id"),
        Index("idx_runs_user", "user_id"),
        Index("idx_runs_status", "status"),
        Index("idx_runs_assistant_id", "assistant_id"),
        Index("idx_runs_created_at", "created_at"),
    )


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    run_id: Mapped[str] = mapped_column(Text, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    event: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    __table_args__ = (
        Index("idx_run_events_run_id", "run_id"),
        Index("idx_run_events_seq", "run_id", "seq"),
    )


class OrchestrationMessage(Base):
    """Stores every message in an orchestrator conversation.

    Each row is one turn — either from the user ("human") or the
    assistant ("ai").  The ``phase`` column records which orchestrator
    phase produced the message (clarifying, researching, planning, etc.).
    ``state_snapshot`` optionally stores the full graph state so the
    session can be restored after a server restart.
    """

    __tablename__ = "orchestration_messages"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    thread_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("thread.thread_id", ondelete="CASCADE"),
        nullable=False,
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)  # "human" | "ai"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    phase: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # clarifying, researching, etc.
    metadata_json: Mapped[dict] = mapped_column(
        "metadata_json", JSONB, server_default=text("'{}'::jsonb")
    )
    state_snapshot: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        doc="Full serialised OrchestratorState — saved on the latest AI turn "
        "so the session can be restored from DB.",
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    __table_args__ = (
        Index("idx_orch_msg_thread", "thread_id"),
        Index("idx_orch_msg_thread_seq", "thread_id", "seq"),
    )


class KnowledgeBase(Base):
    """A knowledge base created for a specific assistant.

    One assistant can have at most one KB (the orchestrator decides
    whether the use-case needs one).  Documents are ingested into
    this KB via the /knowledge-base endpoints.
    """

    __tablename__ = "knowledge_bases"

    kb_id: Mapped[str] = mapped_column(Text, primary_key=True)
    assistant_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("assistant.assistant_id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, server_default=text("''"))
    status: Mapped[str] = mapped_column(
        Text,
        server_default=text("'pending'"),
        doc="pending | ready | ingesting | error",
    )
    config: Mapped[dict] = mapped_column(
        JSONB,
        server_default=text("'{}'::jsonb"),
        doc="chunk_size, chunk_overlap, embedding model, etc.",
    )
    metadata_json: Mapped[dict] = mapped_column(
        "metadata_json",
        JSONB,
        server_default=text("'{}'::jsonb"),
    )
    document_count: Mapped[int] = mapped_column(
        Integer,
        server_default=text("0"),
    )
    user_id: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'system'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_kb_assistant", "assistant_id"),
        Index("idx_kb_user", "user_id"),
        Index("idx_kb_status", "status"),
    )


class KnowledgeBaseDocument(Base):
    """A single document ingested into a knowledge base."""

    __tablename__ = "knowledge_base_documents"

    doc_id: Mapped[str] = mapped_column(Text, primary_key=True)
    kb_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("knowledge_bases.kb_id", ondelete="CASCADE"),
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(
        Text,
        server_default=text("'text/plain'"),
    )
    source_type: Mapped[str] = mapped_column(
        Text,
        server_default=text("'file'"),
        doc="file | url | text",
    )
    source_value: Mapped[str] = mapped_column(
        Text,
        server_default=text("''"),
        doc="Original URL or file path",
    )
    status: Mapped[str] = mapped_column(
        Text,
        server_default=text("'pending'"),
        doc="pending | ingested | error",
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        server_default=text("0"),
    )
    size_bytes: Mapped[int] = mapped_column(
        Integer,
        server_default=text("0"),
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata_json",
        JSONB,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_kb_doc_kb", "kb_id"),
        Index("idx_kb_doc_status", "status"),
    )


async_session_maker: async_sessionmaker[AsyncSession] | None = None


def _get_session_maker() -> async_sessionmaker[AsyncSession]:
    global async_session_maker
    if async_session_maker is None:
        from src.core.database import db_manager

        engine = db_manager.get_engine()
        async_session_maker = async_sessionmaker(engine, expire_on_commit=False)
    return async_session_maker


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields an AsyncSession."""
    maker = _get_session_maker()
    async with maker() as session:
        yield session
