"""Pydantic models for the Agent Orchestrator — the "agent that builds agents"."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ── Orchestrator conversation phase ─────────────────────────────────


class OrchestratorPhase(str, Enum):
    """Which stage the orchestrator is in."""

    CLARIFYING = "clarifying"  # asking the user follow-up questions
    RESEARCHING = "researching"  # deep-researching tool/approach options
    PLANNING = "planning"  # building the blueprint
    REVIEWING = "reviewing"  # self-critique loop
    FINALISED = "finalised"  # blueprint approved, ready to save
    KB_CONFIRM = "kb_confirm"  # asking user to confirm KB creation
    KB_PENDING = "kb_pending"  # KB created, waiting for document ingestion


# ── Tool / Node catalogue (what the orchestrator can pick from) ─────


class AvailableTool(BaseModel):
    """A tool the orchestrator knows it can wire into a graph."""

    name: str = Field(..., description="Tool identifier (e.g. 'web_search')")
    description: str = Field(..., description="What this tool does")
    parameters: Dict[str, str] = Field(
        default_factory=dict, description="param_name → type hint"
    )
    category: str = Field("general", description="Tool category")


class AvailableNodeTemplate(BaseModel):
    """A reusable node template the orchestrator can pick."""

    id: str
    name: str
    description: str
    node_type: str = Field("llm", description="llm | tool | aggregator | router")
    default_system_prompt: Optional[str] = None
    suggested_tools: List[str] = Field(default_factory=list)


# ── The generated blueprint (output of orchestrator) ────────────────


class ToolSelection(BaseModel):
    """A tool selected for a node, with justification."""

    name: str = Field(..., description="Tool identifier (from the universal catalogue)")
    reason: str = Field(
        "",
        description="Why this tool was selected for this node's task",
    )


class NodeBlueprint(BaseModel):
    """One node in the generated graph."""

    id: str = Field(..., description="Unique node identifier")
    name: str = Field(..., description="Human-readable name")
    node_type: str = Field("llm", description="llm | tool | aggregator | human_review")
    model_provider: str = Field("mistral", description="LLM provider")
    model_name: str = Field("mistral-large-latest", description="Model name")
    system_prompt: Optional[str] = None
    tools: List[ToolSelection] = Field(
        default_factory=list,
        description="Tools wired to this node — each with a justification reason",
    )
    temperature: float = 0.7
    max_tokens: int = 4096

    @property
    def tool_names(self) -> List[str]:
        """Convenience — return just the tool name strings."""
        return [t.name for t in self.tools]


class EdgeBlueprint(BaseModel):
    """One edge in the generated graph."""

    source: str
    target: str
    edge_type: str = Field("direct", description="direct | conditional")
    condition: Optional[str] = Field(
        None, description="Natural-language condition (for conditional edges)"
    )


class KnowledgeBaseConfig(BaseModel):
    """Knowledge base that the built agent should have access to."""

    name: str
    description: str
    source_type: str = Field("url", description="url | file | text")
    source_value: str = Field("", description="URL / file path / raw text")
    chunk_size: int = 500
    chunk_overlap: int = 50


class GeneratedBlueprint(BaseModel):
    """The full blueprint the orchestrator produces — saved as assistant.config."""

    name: str
    description: str
    goal: str = Field(..., description="The user's use-case in one sentence")
    use_case: Optional[str] = Field(
        None,
        description="Scoped use-case domain (housing_crisis, legal_aid, healthcare, crisis_support)",
    )
    agent_type: str = Field("single", description="single | multi | deep_research")
    nodes: List[NodeBlueprint] = Field(default_factory=list)
    edges: List[EdgeBlueprint] = Field(default_factory=list)
    entry_point: str = Field("", description="ID of the first node")
    knowledge_bases: List[KnowledgeBaseConfig] = Field(default_factory=list)
    max_iterations: int = 25


# ── Request / Response for the orchestrator endpoint ────────────────


class OrchestratorMessageRequest(BaseModel):
    """User sends a message to the orchestrator conversation.

    For /start: provide ``message`` with the use-case description.
    For /continue: provide EITHER ``message`` (free-form) OR ``answers``
    (a list of strings matching the clarification questions).  If both
    are given, ``answers`` takes priority and is formatted automatically.
    """

    message: Optional[str] = Field(
        None, min_length=1, description="User message (free-form text)"
    )
    answers: Optional[List[str]] = Field(
        None,
        description="List of answers to the clarification questions (alternative to message)",
    )
    thread_id: Optional[str] = Field(
        None, description="Existing thread ID to continue conversation"
    )
    use_case: Optional[str] = Field(
        None,
        description=(
            "Use-case domain that scopes which tools are available. "
            "One of: housing_crisis, legal_aid, healthcare, crisis_support. "
            "If omitted on /start the LLM receives all tools."
        ),
    )
    skip_clarification: bool = Field(
        False,
        description="If True, skip clarification questions and proceed directly to building the agent",
    )
    model_provider: str = Field(
        "mistral",
        description="LLM provider: 'mistral' (Mistral AI) or 'ollama' (local)",
    )
    model_name: str = Field(
        "mistral-large-latest",
        description="Model name, e.g. 'mistral-large-latest' for Mistral or 'qwen2.5:3b' for Ollama",
    )

    @property
    def resolved_message(self) -> str:
        """Return a single message string.

        If ``answers`` is provided, join them into a numbered list.
        Otherwise fall back to ``message``.
        """
        if self.answers:
            lines = [f"{i+1}. {a}" for i, a in enumerate(self.answers)]
            return "\n".join(lines)
        return self.message or ""


class OrchestratorStatusResponse(BaseModel):
    """Returned after orchestrator finishes (non-streaming fallback)."""

    thread_id: str
    phase: OrchestratorPhase
    assistant_message: str
    blueprint: Optional[GeneratedBlueprint] = None
    assistant_id: Optional[str] = Field(
        None, description="Set once the blueprint is saved as an assistant"
    )
