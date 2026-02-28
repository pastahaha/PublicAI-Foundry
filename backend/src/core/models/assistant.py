from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class AssistantConfig(BaseModel):
    """The agent configuration stored inside an assistant."""

    model_provider: str = Field(
        ..., description="LLM provider: openai, anthropic, etc."
    )
    model_name: str = Field(
        ..., description="Model name: gpt-4o, claude-sonnet-4-5-20250929, etc."
    )
    system_prompt: str = Field(..., description="System prompt for the agent")
    temperature: float = Field(0.7, description="LLM temperature")
    max_tokens: int = Field(4096, description="Maximum tokens for the response")
    tools: List[str] = Field(default_factory=list, description="Tool names to enable")


class CreateAssistantRequest(BaseModel):
    assistant_id: Optional[str] = Field(None, description="Optional client-provided ID")
    name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Description of the assistant")
    config: AssistantConfig = Field(
        ..., description="Agent configuration (model, prompt, tools)"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Arbitrary metadata"
    )


class UpdateAssistantRequest(BaseModel):
    name: Optional[str] = Field(None, description="Update name")
    description: Optional[str] = Field(None, description="Update description")
    config: Optional[AssistantConfig] = Field(
        None, description="Update agent configuration"
    )
    metadata: Optional[Dict[str, Any]] = Field(None, description="Update metadata")


class AssistantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    assistant_id: str
    name: str
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    created_at: datetime
    updated_at: datetime
