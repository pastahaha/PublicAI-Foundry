"""BlueprintGraphService — resolves assistant_id → compiled LangGraph graph.

Flow:
 1. Look up the assistant in PostgreSQL (assistant table)
 2. Extract the agent config JSON from the assistant's `config` column
 3. Build a Blueprint model from it
 4. Compile via BlueprintCompiler (cached)
 5. Inject PostgreSQL checkpointer + store per-request
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from langgraph.pregel import Pregel

from src.core.models.agents import (
    AgentConfiguration,
    AgentModelConfiguration,
    Blueprint,
)
from src.core.database import db_manager
from src.core.orm import Assistant as AssistantORM


logger = structlog.get_logger(__name__)


def _assistant_to_blueprint(assistant: AssistantORM) -> Blueprint:
    """Convert an Assistant ORM row into a Blueprint model for the compiler."""
    cfg = assistant.config or {}

    model_config = AgentModelConfiguration(
        provider=cfg.get("model_provider", "mistral"),
        name=cfg.get("model_name", "mistral-large-latest"),
        temperature=cfg.get("temperature", 0.7),
        max_tokens=cfg.get("max_tokens", 4096),
    )

    agent_config = AgentConfiguration(
        model=model_config,
        system_prompt=cfg.get("system_prompt", "You are a helpful assistant."),
        tools=cfg.get("tools", []),
    )

    return Blueprint(
        id=assistant.assistant_id,
        version=str(assistant.version),
        name=assistant.name,
        description=assistant.description,
        agent=agent_config,
    )


class BlueprintGraphService:
    """Resolves assistant_id → compiled graph with persistence injected."""

    def __init__(self, compiler):
        self.compiler = compiler

    async def get_assistant(self, assistant_id: str) -> AssistantORM:
        """Fetch assistant from database."""
        from src.core.orm import _get_session_maker

        maker = _get_session_maker()
        async with maker() as session:
            assistant = await session.get(AssistantORM, assistant_id)
            if not assistant:
                raise ValueError(f"Assistant {assistant_id} not found")
            return assistant

    async def get_base_graph(self, assistant_id: str) -> Pregel:
        """Look up assistant in DB → build Blueprint → compile (or return cached)."""
        assistant = await self.get_assistant(assistant_id)
        blueprint = _assistant_to_blueprint(assistant)
        return self.compiler.compile(blueprint)

    @asynccontextmanager
    async def get_graph(self, assistant_id: str) -> AsyncIterator[Pregel]:
        """Context manager yielding a graph with PostgreSQL checkpointer/store injected.

        Usage:
            async with graph_service.get_graph("asst_123") as graph:
                result = await graph.ainvoke(input_data, config=config)
        """
        base_graph = await self.get_base_graph(assistant_id)

        checkpointer = db_manager.get_checkpointer()
        store = db_manager.get_store()

        try:
            graph = base_graph.copy(
                update={"checkpointer": checkpointer, "store": store}
            )
        except Exception:
            logger.warning(
                "graph.copy_failed",
                assistant_id=assistant_id,
                hint="Running without persistence",
            )
            graph = base_graph

        yield graph


def generate_event_id(run_id: str, seq: int) -> str:
    """Generate a deterministic event ID for SSE."""
    return f"{run_id}_event_{seq}"


def create_run_config(
    run_id: str,
    thread_id: str,
    additional_config: dict | None = None,
) -> dict[str, Any]:
    """Create LangGraph run config with observability metadata."""
    from copy import deepcopy

    cfg: dict = deepcopy(additional_config) if additional_config else {}
    cfg.setdefault("configurable", {})
    cfg["configurable"].setdefault("thread_id", thread_id)
    # NOTE: run_id must NOT go in configurable — the checkpointer uses
    # configurable keys for checkpoint lookup.  Putting run_id there causes
    # each run to start from a blank checkpoint, breaking multi-turn.
    cfg.setdefault("run_id", run_id)

    return cfg
