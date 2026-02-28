from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from enum import Enum


class AgentType(Enum):
    SINGLE = "single"
    MULTI = "multi"
    DEEP_RESEARCH = "deep_research"

    def __str__(self):
        return self.value


class AgentModelConfiguration(BaseModel):
    provider: str  # "openai", "anthropic", etc.
    name: str  # "gpt-4o", "claude-sonnet-4-5-20250929", etc.
    temperature: float = 0.7
    max_tokens: int = 4096


class AgentConfiguration(BaseModel):
    type: AgentType = AgentType.SINGLE
    model: AgentModelConfiguration
    system_prompt: str
    tools: List[str] = Field(default_factory=list)


class BlueprintMetadata(BaseModel):
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)


class Blueprint(BaseModel):
    """
    Represents a full agent blueprint as fetched from the external service.
    Maps to the v1 blueprint schema from agent-builder.md.
    """

    version: str = "1.0"
    id: str
    name: str
    description: Optional[str] = None
    agent: AgentConfiguration
    metadata: Optional[BlueprintMetadata] = None

    # Allow extra fields so forward-compatible with future schema versions
    model_config = {"extra": "allow"}


class AgentModel(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
