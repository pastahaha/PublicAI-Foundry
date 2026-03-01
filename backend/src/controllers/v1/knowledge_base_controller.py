"""Knowledge Base Controller — manage KBs and ingest documents.

Endpoints:
  GET    /knowledge-base/{kb_id}              — Get KB details & document list
  GET    /knowledge-base/{kb_id}/stats        — Get vector store stats
  POST   /knowledge-base/{kb_id}/ingest       — Upload files for ingestion
  POST   /knowledge-base/{kb_id}/ingest/url   — Ingest from a URL
  POST   /knowledge-base/{kb_id}/ingest/text  — Ingest raw text
  POST   /knowledge-base/{kb_id}/ingest/batch-urls — Ingest multiple URLs
  DELETE /knowledge-base/{kb_id}/documents/{doc_id} — Remove a document
"""

from __future__ import annotations

import asyncio
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
from src.services.ingestion_service import (
    ingest_text_to_chroma,
    ingest_url_to_chroma,
    get_collection_stats,
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


class BatchUrlRequest(BaseModel):
    """Ingest multiple URLs at once (used by orchestrator auto-ingestion)."""
    urls: List[dict] = Field(
        ...,
        description='List of {url, label?, description?} objects to ingest',
    )
    chunk_size: int = Field(500, description="Characters per chunk")
    chunk_overlap: int = Field(50, description="Overlap between chunks")


class IngestResponse(BaseModel):
    kb_id: str
    doc_id: str
    filename: str
    status: str
    chunk_count: int = 0
    size_bytes: int = 0
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

        # Decode text content for embedding
        try:
            text_content = content.decode("utf-8", errors="replace")
        except Exception:
            text_content = content.decode("latin-1", errors="replace")

        # Ingest into ChromaDB
        chroma_result = await ingest_text_to_chroma(
            kb_id=kb_id,
            doc_id=doc_id,
            text=text_content,
            metadata={
                "source_type": "file",
                "filename": f.filename or "unnamed",
                "content_type": f.content_type or "text/plain",
            },
            chunk_size=500,
            chunk_overlap=50,
        )
        chunk_count = chroma_result.get("chunk_count", 0)
        ingest_status = chroma_result.get("status", "ingested")

        doc = KnowledgeBaseDocumentORM(
            doc_id=doc_id,
            kb_id=kb_id,
            filename=f.filename or "unnamed",
            content_type=f.content_type or "application/octet-stream",
            source_type="file",
            source_value=f.filename or "",
            status=ingest_status,
            chunk_count=chunk_count,
            size_bytes=size,
            error_message=chroma_result.get("error"),
            metadata_json={"original_filename": f.filename},
            created_at=now,
        )
        session.add(doc)

        logger.info(
            "📄 Document ingested: kb=%s doc=%s file='%s' size=%d chunks=%d",
            kb_id, doc_id, f.filename, size, chunk_count,
        )

        results.append(
            IngestResponse(
                kb_id=kb_id,
                doc_id=doc_id,
                filename=f.filename or "unnamed",
                status=ingest_status,
                chunk_count=chunk_count,
                size_bytes=size,
                message=f"File '{f.filename}' ingested ({size} bytes, {chunk_count} chunks).",
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

    # Actually scrape and ingest the URL into ChromaDB
    chroma_result = await ingest_url_to_chroma(
        kb_id=kb_id,
        doc_id=doc_id,
        url=req.url,
        label=filename,
        chunk_size=500,
        chunk_overlap=50,
    )
    chunk_count = chroma_result.get("chunk_count", 0)
    size_bytes = chroma_result.get("size_bytes", 0)
    ingest_status = chroma_result.get("status", "ingested")
    title = chroma_result.get("title", filename)

    doc = KnowledgeBaseDocumentORM(
        doc_id=doc_id,
        kb_id=kb_id,
        filename=title,
        content_type="text/html",
        source_type="url",
        source_value=req.url,
        status=ingest_status,
        chunk_count=chunk_count,
        size_bytes=size_bytes,
        error_message=chroma_result.get("error"),
        metadata_json={
            "url": req.url,
            "title": title,
            "description": chroma_result.get("description", ""),
        },
        created_at=now,
    )
    session.add(doc)

    kb.document_count = (kb.document_count or 0) + 1
    kb.status = "ready"
    kb.updated_at = now
    await session.commit()

    logger.info(
        "🌐 URL ingested: kb=%s doc=%s url='%s' chunks=%d",
        kb_id, doc_id, req.url, chunk_count,
    )

    return IngestResponse(
        kb_id=kb_id,
        doc_id=doc_id,
        filename=title,
        status=ingest_status,
        chunk_count=chunk_count,
        size_bytes=size_bytes,
        message=f"URL '{req.url}' ingested ({size_bytes} bytes, {chunk_count} chunks).",
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
    size_bytes = len(req.text.encode("utf-8"))

    # Ingest into ChromaDB
    chroma_result = await ingest_text_to_chroma(
        kb_id=kb_id,
        doc_id=doc_id,
        text=req.text,
        metadata={
            "source_type": "text",
            "filename": req.filename,
        },
        chunk_size=500,
        chunk_overlap=50,
    )
    chunk_count = chroma_result.get("chunk_count", 0)
    ingest_status = chroma_result.get("status", "ingested")

    doc = KnowledgeBaseDocumentORM(
        doc_id=doc_id,
        kb_id=kb_id,
        filename=req.filename,
        content_type="text/plain",
        source_type="text",
        source_value=req.text[:200],  # store preview
        status=ingest_status,
        chunk_count=chunk_count,
        size_bytes=size_bytes,
        error_message=chroma_result.get("error"),
        metadata_json={"text_length": len(req.text)},
        created_at=now,
    )
    session.add(doc)

    kb.document_count = (kb.document_count or 0) + 1
    kb.status = "ready"
    kb.updated_at = now
    await session.commit()

    logger.info(
        "📝 Text ingested: kb=%s doc=%s len=%d chunks=%d",
        kb_id, doc_id, len(req.text), chunk_count,
    )

    return IngestResponse(
        kb_id=kb_id,
        doc_id=doc_id,
        filename=req.filename,
        status=ingest_status,
        chunk_count=chunk_count,
        size_bytes=size_bytes,
        message=f"Text ingested ({len(req.text)} chars, {chunk_count} chunks).",
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


# ── POST /knowledge-base/{kb_id}/ingest/batch-urls ──────────────────


@kb_router.post("/{kb_id}/ingest/batch-urls")
async def ingest_batch_urls(
    kb_id: str,
    req: BatchUrlRequest,
    session: AsyncSession = Depends(get_session),
):
    """Ingest multiple URLs concurrently into the knowledge base.

    Each URL is scraped, chunked, embedded, and stored in ChromaDB.
    Used by the orchestrator to auto-ingest curated reference sources.
    """
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    now = datetime.now(UTC)
    results = []
    total_chunks = 0
    total_bytes = 0
    success_count = 0
    error_count = 0

    # Process URLs concurrently in batches of 5
    for batch_start in range(0, len(req.urls), 5):
        batch = req.urls[batch_start : batch_start + 5]
        tasks = []
        doc_ids = []

        for url_item in batch:
            url = url_item.get("url", "") if isinstance(url_item, dict) else str(url_item)
            label = url_item.get("label", "") if isinstance(url_item, dict) else ""
            if not url:
                continue
            doc_id = str(uuid4())
            doc_ids.append((doc_id, url, label, url_item))
            tasks.append(
                ingest_url_to_chroma(
                    kb_id=kb_id,
                    doc_id=doc_id,
                    url=url,
                    label=label,
                    chunk_size=req.chunk_size,
                    chunk_overlap=req.chunk_overlap,
                )
            )

        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        for (doc_id, url, label, url_item), result in zip(doc_ids, batch_results):
            if isinstance(result, Exception):
                result = {"doc_id": doc_id, "chunk_count": 0, "status": "error", "error": str(result)}

            chunk_count = result.get("chunk_count", 0)
            size_bytes = result.get("size_bytes", 0)
            status = result.get("status", "error")
            title = result.get("title", label or url)
            description = url_item.get("description", "") if isinstance(url_item, dict) else ""

            doc = KnowledgeBaseDocumentORM(
                doc_id=doc_id,
                kb_id=kb_id,
                filename=title,
                content_type="text/html",
                source_type="url",
                source_value=url,
                status=status,
                chunk_count=chunk_count,
                size_bytes=size_bytes,
                error_message=result.get("error"),
                metadata_json={
                    "url": url,
                    "title": title,
                    "label": label,
                    "description": description or result.get("description", ""),
                },
                created_at=now,
            )
            session.add(doc)

            if status == "ingested":
                success_count += 1
                total_chunks += chunk_count
                total_bytes += size_bytes
            else:
                error_count += 1

            results.append({
                "doc_id": doc_id,
                "url": url,
                "title": title,
                "status": status,
                "chunk_count": chunk_count,
                "size_bytes": size_bytes,
                "error": result.get("error"),
            })

    # Update KB counters
    kb.document_count = (kb.document_count or 0) + success_count
    kb.status = "ready" if kb.document_count > 0 else "pending"
    kb.updated_at = now
    await session.commit()

    logger.info(
        "📚 Batch URL ingestion: kb=%s success=%d errors=%d total_chunks=%d total_bytes=%d",
        kb_id, success_count, error_count, total_chunks, total_bytes,
    )

    return {
        "kb_id": kb_id,
        "total_urls": len(req.urls),
        "success_count": success_count,
        "error_count": error_count,
        "total_chunks": total_chunks,
        "total_bytes": total_bytes,
        "results": results,
    }


# ── GET /knowledge-base/{kb_id}/stats ────────────────────────────────


@kb_router.get("/{kb_id}/stats")
async def get_kb_stats(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get vector store statistics for a knowledge base."""
    kb = await session.get(KnowledgeBaseORM, kb_id)
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_id}' not found"
        )

    chroma_stats = await get_collection_stats(kb_id)

    return {
        "kb_id": kb_id,
        "name": kb.name,
        "status": kb.status,
        "document_count": kb.document_count,
        "vector_store": chroma_stats,
    }
