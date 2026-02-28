"""Knowledge Base Controller — manage KBs and ingest documents.

Endpoints:
  GET    /knowledge-base/{kb_id}              — Get KB details & document list
  POST   /knowledge-base/{kb_id}/ingest       — Upload files for ingestion
  POST   /knowledge-base/{kb_id}/ingest/url   — Ingest from a URL
  POST   /knowledge-base/{kb_id}/ingest/text  — Ingest raw text
  DELETE /knowledge-base/{kb_id}/documents/{doc_id} — Remove a document
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from pytz import UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from src.core.orm import (
    KnowledgeBase as KnowledgeBaseORM,
    KnowledgeBaseDocument as KnowledgeBaseDocumentORM,
    get_session,
)

logger = logging.getLogger(__name__)

kb_router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


# ── Response models ──────────────────────────────────────────────────


class DocumentOut(BaseModel):
    doc_id: str
    filename: str
    content_type: str
    source_type: str
    source_value: str
    status: str
    chunk_count: int
    size_bytes: int
    error_message: Optional[str] = None
    created_at: datetime


class KnowledgeBaseOut(BaseModel):
    kb_id: str
    assistant_id: Optional[str] = None
    name: str
    description: str
    status: str
    config: dict
    document_count: int
    documents: List[DocumentOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class IngestUrlRequest(BaseModel):
    url: str = Field(..., description="URL to scrape and ingest")
    filename: Optional[str] = Field(None, description="Optional display name")


class IngestTextRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Raw text content to ingest")
    filename: str = Field("inline_text.txt", description="Display name for the text")


class IngestResponse(BaseModel):
    kb_id: str
    doc_id: str
    filename: str
    status: str
    message: str


# ── GET /knowledge-base/{kb_id} ─────────────────────────────────────


@kb_router.get("/{kb_id}", response_model=KnowledgeBaseOut)
async def get_knowledge_base(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get knowledge base details including all documents."""
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    result = await session.execute(
        select(KnowledgeBaseDocumentORM)
        .where(KnowledgeBaseDocumentORM.kb_id == kb_id)
        .order_by(KnowledgeBaseDocumentORM.created_at.asc())
    )
    docs = result.scalars().all()

    return KnowledgeBaseOut(
        kb_id=kb.kb_id,
        assistant_id=kb.assistant_id,
        name=kb.name,
        description=kb.description,
        status=kb.status,
        config=kb.config or {},
        document_count=kb.document_count,
        documents=[
            DocumentOut(
                doc_id=d.doc_id,
                filename=d.filename,
                content_type=d.content_type,
                source_type=d.source_type,
                source_value=d.source_value,
                status=d.status,
                chunk_count=d.chunk_count,
                size_bytes=d.size_bytes,
                error_message=d.error_message,
                created_at=d.created_at,
            )
            for d in docs
        ],
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@kb_router.post("/{kb_id}/ingest", response_model=List[IngestResponse])
async def ingest_files(
    kb_id: str,
    files: List[UploadFile] = File(..., description="One or more files to ingest"),
    session: AsyncSession = Depends(get_session),
):
    """Upload one or more files into the knowledge base.

    Supported formats: .txt, .md, .pdf, .csv, .json, .html
    Files are stored as document records.  Actual chunking and
    embedding happens asynchronously (placeholder — integrate your
    vector store here).
    """
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    now = datetime.now(UTC)
    results: List[IngestResponse] = []

    for f in files:
        doc_id = str(uuid4())
        content = await f.read()
        size = len(content)

        doc = KnowledgeBaseDocumentORM(
            doc_id=doc_id,
            kb_id=kb_id,
            filename=f.filename or "unnamed",
            content_type=f.content_type or "application/octet-stream",
            source_type="file",
            source_value=f.filename or "",
            status="ingested",  # TODO: change to "pending" when async chunking is added
            chunk_count=0,  # TODO: populate after chunking
            size_bytes=size,
            metadata_json={"original_filename": f.filename},
            created_at=now,
        )
        session.add(doc)

        logger.info(
            "📄 Document ingested: kb=%s doc=%s file='%s' size=%d bytes",
            kb_id,
            doc_id,
            f.filename,
            size,
        )

        results.append(
            IngestResponse(
                kb_id=kb_id,
                doc_id=doc_id,
                filename=f.filename or "unnamed",
                status="ingested",
                message=f"File '{f.filename}' uploaded ({size} bytes). Chunking and embedding pending.",
            )
        )

    # Update KB counters
    kb.document_count = (kb.document_count or 0) + len(files)
    kb.status = "ready" if kb.document_count > 0 else "pending"
    kb.updated_at = now
    await session.commit()

    return results


# ── POST /knowledge-base/{kb_id}/ingest/url ─────────────────────────


@kb_router.post("/{kb_id}/ingest/url", response_model=IngestResponse)
async def ingest_url(
    kb_id: str,
    req: IngestUrlRequest,
    session: AsyncSession = Depends(get_session),
):
    """Ingest content from a URL into the knowledge base.

    The URL will be scraped and the text content stored as a document.
    Actual chunking/embedding is a placeholder.
    """
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    now = datetime.now(UTC)
    doc_id = str(uuid4())
    filename = req.filename or req.url.split("/")[-1] or "web_page"

    # TODO: actually scrape the URL here
    # For now, create the document record
    doc = KnowledgeBaseDocumentORM(
        doc_id=doc_id,
        kb_id=kb_id,
        filename=filename,
        content_type="text/html",
        source_type="url",
        source_value=req.url,
        status="ingested",
        chunk_count=0,
        size_bytes=0,
        metadata_json={"url": req.url},
        created_at=now,
    )
    session.add(doc)

    kb.document_count = (kb.document_count or 0) + 1
    kb.status = "ready"
    kb.updated_at = now
    await session.commit()

    logger.info("🌐 URL ingested: kb=%s doc=%s url='%s'", kb_id, doc_id, req.url)

    return IngestResponse(
        kb_id=kb_id,
        doc_id=doc_id,
        filename=filename,
        status="ingested",
        message=f"URL '{req.url}' ingested. Chunking and embedding pending.",
    )


# ── POST /knowledge-base/{kb_id}/ingest/text ────────────────────────


@kb_router.post("/{kb_id}/ingest/text", response_model=IngestResponse)
async def ingest_text(
    kb_id: str,
    req: IngestTextRequest,
    session: AsyncSession = Depends(get_session),
):
    """Ingest raw text directly into the knowledge base."""
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    now = datetime.now(UTC)
    doc_id = str(uuid4())

    doc = KnowledgeBaseDocumentORM(
        doc_id=doc_id,
        kb_id=kb_id,
        filename=req.filename,
        content_type="text/plain",
        source_type="text",
        source_value=req.text[:200],  # store preview
        status="ingested",
        chunk_count=0,
        size_bytes=len(req.text.encode("utf-8")),
        metadata_json={"text_length": len(req.text)},
        created_at=now,
    )
    session.add(doc)

    kb.document_count = (kb.document_count or 0) + 1
    kb.status = "ready"
    kb.updated_at = now
    await session.commit()

    logger.info("📝 Text ingested: kb=%s doc=%s len=%d", kb_id, doc_id, len(req.text))

    return IngestResponse(
        kb_id=kb_id,
        doc_id=doc_id,
        filename=req.filename,
        status="ingested",
        message=f"Text ingested ({len(req.text)} chars). Chunking and embedding pending.",
    )


# ── DELETE /knowledge-base/{kb_id}/documents/{doc_id} ────────────────


@kb_router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document(
    kb_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Remove a document from the knowledge base."""
    doc = await session.get(KnowledgeBaseDocumentORM, doc_id)
    if not doc or doc.kb_id != kb_id:
        raise HTTPException(
            status_code=404, detail="Document not found in this knowledge base"
        )

    await session.delete(doc)

    kb = await session.get(KnowledgeBaseORM, kb_id)
    if kb:
        kb.document_count = max(0, (kb.document_count or 1) - 1)
        kb.status = "ready" if kb.document_count > 0 else "pending"
        kb.updated_at = datetime.now(UTC)

    await session.commit()

    logger.info("🗑️ Document deleted: kb=%s doc=%s", kb_id, doc_id)

    return {
        "success": True,
        "message": f"Document '{doc_id}' removed from knowledge base.",
    }
