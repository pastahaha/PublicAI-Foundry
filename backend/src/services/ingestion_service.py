"""Ingestion service — chunking, embedding, and ChromaDB vector storage.

Handles the full pipeline:
  1. Text extraction (from URLs via scrape, files, or raw text)
  2. Chunking (recursive character splitting)
  3. Embedding (via Mistral embeddings API)
  4. Storage in ChromaDB (persistent, one collection per KB)
  5. Retrieval (similarity search)

Each KnowledgeBase gets its own ChromaDB collection named ``kb_{kb_id}``.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, List, Optional
from uuid import uuid4

import httpx

logger = logging.getLogger(__name__)

# ── ChromaDB client (lazy singleton) ─────────────────────────────────

_chroma_client = None
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "/app/chroma_data")


def _get_chroma():
    """Get or create the persistent ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        import chromadb

        os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        logger.info("🗄️  ChromaDB initialised at %s", CHROMA_PERSIST_DIR)
    return _chroma_client


def _collection_name(kb_id: str) -> str:
    """Sanitise KB ID into a valid ChromaDB collection name."""
    # ChromaDB requires 3-63 chars, alphanumeric + underscores + hyphens
    clean = re.sub(r"[^a-zA-Z0-9_-]", "_", kb_id)
    return f"kb_{clean}"[:63]


# ── Text chunking ────────────────────────────────────────────────────


def chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> List[str]:
    """Split text into overlapping chunks using recursive character splitting.

    Tries to split on paragraphs → sentences → words → characters.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    if len(text) <= chunk_size:
        return [text]

    # Separators in priority order
    separators = ["\n\n", "\n", ". ", ", ", " ", ""]
    chunks: List[str] = []
    _recursive_split(text, separators, chunk_size, chunk_overlap, chunks)
    return [c.strip() for c in chunks if c.strip()]


def _recursive_split(
    text: str,
    separators: List[str],
    chunk_size: int,
    overlap: int,
    result: List[str],
) -> None:
    """Internal recursive splitting."""
    if len(text) <= chunk_size:
        result.append(text)
        return

    sep = separators[0] if separators else ""
    remaining_seps = separators[1:] if len(separators) > 1 else [""]

    if not sep:
        # Character-level fallback
        for i in range(0, len(text), chunk_size - overlap):
            result.append(text[i : i + chunk_size])
        return

    parts = text.split(sep)
    current = ""

    for part in parts:
        candidate = f"{current}{sep}{part}" if current else part
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                result.append(current)
            if len(part) > chunk_size:
                _recursive_split(part, remaining_seps, chunk_size, overlap, result)
                current = ""
            else:
                current = part

    if current:
        result.append(current)


# ── Embedding ────────────────────────────────────────────────────────


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a batch of texts using the Mistral Embeddings API.

    Uses ``mistral-embed`` model. Falls back to a simple hash-based
    embedding if the API key is missing (for dev/testing).
    """
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        logger.warning("MISTRAL_API_KEY not set — using hash-based fallback embeddings")
        return [_hash_embed(t) for t in texts]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Mistral embeddings API — batch up to 64 texts
            all_embeddings: List[List[float]] = []
            for i in range(0, len(texts), 64):
                batch = texts[i : i + 64]
                resp = await client.post(
                    "https://api.mistral.ai/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "mistral-embed",
                        "input": batch,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                batch_embeds = [d["embedding"] for d in data["data"]]
                all_embeddings.extend(batch_embeds)

            logger.info("✨ Embedded %d texts via Mistral API", len(texts))
            return all_embeddings

    except Exception as e:
        logger.error("❌ Mistral embedding failed: %s — using fallback", e)
        return [_hash_embed(t) for t in texts]


def _hash_embed(text: str, dim: int = 1024) -> List[float]:
    """Deterministic hash-based embedding fallback (for dev/testing only)."""
    import hashlib

    h = hashlib.sha256(text.encode()).hexdigest()
    vals = []
    for i in range(0, min(len(h), dim * 2), 2):
        vals.append((int(h[i : i + 2], 16) - 128) / 128.0)
    # Pad to dim
    while len(vals) < dim:
        vals.append(0.0)
    return vals[:dim]


# ── Ingestion pipeline ───────────────────────────────────────────────


async def scrape_url_content(url: str) -> dict:
    """Scrape a URL and return {url, title, content, error}."""
    try:
        from bs4 import BeautifulSoup

        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
            headers={"User-Agent": "PublicAI-Foundry/1.0 (kb-ingestion)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove non-content elements
        for tag in soup(
            ["script", "style", "nav", "footer", "header", "aside", "noscript", "form"]
        ):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{3,}", "\n\n", text)

        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        # Also extract meta description
        meta_desc = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag and meta_tag.get("content"):
            meta_desc = meta_tag["content"].strip()

        logger.info("🌐 Scraped %d chars from %s", len(text), url)
        return {
            "url": url,
            "title": title or url,
            "description": meta_desc,
            "content": text,
            "size_bytes": len(text.encode("utf-8")),
            "error": None,
        }

    except Exception as e:
        logger.error("❌ Scrape failed for %s: %s", url, e)
        return {
            "url": url,
            "title": url,
            "description": "",
            "content": "",
            "size_bytes": 0,
            "error": str(e),
        }


async def ingest_text_to_chroma(
    kb_id: str,
    doc_id: str,
    text: str,
    metadata: dict | None = None,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> dict:
    """Chunk text, embed, and store in ChromaDB.

    Returns {doc_id, chunk_count, status, error}.
    """
    if not text or not text.strip():
        return {"doc_id": doc_id, "chunk_count": 0, "status": "error", "error": "Empty text"}

    try:
        chunks = chunk_text(text, chunk_size, chunk_overlap)
        if not chunks:
            return {"doc_id": doc_id, "chunk_count": 0, "status": "error", "error": "No chunks produced"}

        embeddings = await embed_texts(chunks)

        chroma = _get_chroma()
        col_name = _collection_name(kb_id)
        collection = chroma.get_or_create_collection(
            name=col_name,
            metadata={"hnsw:space": "cosine"},
        )

        # Build IDs and metadata for each chunk
        ids = [f"{doc_id}__chunk_{i}" for i in range(len(chunks))]
        metadatas = []
        base_meta = metadata or {}
        for i, chunk in enumerate(chunks):
            metadatas.append({
                **{k: str(v) for k, v in base_meta.items()},
                "doc_id": doc_id,
                "kb_id": kb_id,
                "chunk_index": str(i),
                "chunk_length": str(len(chunk)),
            })

        collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        logger.info(
            "📦 Ingested doc %s into KB %s: %d chunks → collection '%s'",
            doc_id, kb_id, len(chunks), col_name,
        )
        return {
            "doc_id": doc_id,
            "chunk_count": len(chunks),
            "status": "ingested",
            "error": None,
        }

    except Exception as e:
        logger.error("❌ Ingestion failed for doc %s: %s", doc_id, e)
        return {"doc_id": doc_id, "chunk_count": 0, "status": "error", "error": str(e)}


async def ingest_url_to_chroma(
    kb_id: str,
    doc_id: str,
    url: str,
    label: str = "",
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> dict:
    """Scrape a URL and ingest its content into ChromaDB.

    Returns {doc_id, url, title, chunk_count, size_bytes, status, error}.
    """
    scraped = await scrape_url_content(url)

    if scraped["error"] or not scraped["content"]:
        return {
            "doc_id": doc_id,
            "url": url,
            "title": scraped["title"],
            "chunk_count": 0,
            "size_bytes": 0,
            "status": "error",
            "error": scraped["error"] or "No content extracted",
        }

    result = await ingest_text_to_chroma(
        kb_id=kb_id,
        doc_id=doc_id,
        text=scraped["content"],
        metadata={
            "source_type": "url",
            "source_url": url,
            "title": scraped["title"],
            "label": label or scraped["title"],
        },
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    return {
        **result,
        "url": url,
        "title": scraped["title"],
        "description": scraped["description"],
        "size_bytes": scraped["size_bytes"],
    }


# ── Retrieval ────────────────────────────────────────────────────────


async def query_chroma(
    kb_id: str,
    query: str,
    n_results: int = 5,
) -> List[dict]:
    """Query a KB's ChromaDB collection for relevant chunks.

    Returns a list of {chunk, score, metadata} dicts.
    """
    try:
        embeddings = await embed_texts([query])
        if not embeddings:
            return []

        chroma = _get_chroma()
        col_name = _collection_name(kb_id)

        try:
            collection = chroma.get_collection(name=col_name)
        except Exception:
            logger.warning("KB collection '%s' not found — empty results", col_name)
            return []

        results = collection.query(
            query_embeddings=embeddings,
            n_results=min(n_results, collection.count() or 1),
            include=["documents", "metadatas", "distances"],
        )

        output = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for i, doc in enumerate(docs):
            score = 1.0 - (distances[i] if i < len(distances) else 1.0)
            meta = metas[i] if i < len(metas) else {}
            output.append({
                "chunk": doc,
                "score": round(score, 4),
                "source_url": meta.get("source_url", ""),
                "title": meta.get("title", ""),
                "label": meta.get("label", ""),
                "doc_id": meta.get("doc_id", ""),
            })

        logger.info(
            "🔍 ChromaDB query on KB %s: %d results for '%s'",
            kb_id, len(output), query[:100],
        )
        return output

    except Exception as e:
        logger.error("❌ ChromaDB query failed for KB %s: %s", kb_id, e)
        return []


async def get_collection_stats(kb_id: str) -> dict:
    """Get stats about a KB's ChromaDB collection."""
    try:
        chroma = _get_chroma()
        col_name = _collection_name(kb_id)
        try:
            collection = chroma.get_collection(name=col_name)
            return {
                "kb_id": kb_id,
                "collection": col_name,
                "chunk_count": collection.count(),
                "status": "ready" if collection.count() > 0 else "empty",
            }
        except Exception:
            return {
                "kb_id": kb_id,
                "collection": col_name,
                "chunk_count": 0,
                "status": "not_created",
            }
    except Exception as e:
        return {
            "kb_id": kb_id,
            "collection": "",
            "chunk_count": 0,
            "status": "error",
            "error": str(e),
        }


async def delete_collection(kb_id: str) -> bool:
    """Delete a KB's ChromaDB collection."""
    try:
        chroma = _get_chroma()
        col_name = _collection_name(kb_id)
        chroma.delete_collection(name=col_name)
        logger.info("🗑️ Deleted ChromaDB collection '%s'", col_name)
        return True
    except Exception as e:
        logger.warning("Could not delete collection for KB %s: %s", kb_id, e)
        return False
