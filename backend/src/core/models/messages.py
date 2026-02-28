from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, Any, Dict, List


class ChatMessage(BaseModel):
    role: str
    content: str


class CreateThreadRequest(BaseModel):
    metadata: Optional[Dict[str, Any]] = None
    thread_id: Optional[str] = Field(
        None, description="Optional client-provided thread ID"
    )


class ThreadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    thread_id: str
    status: str = "idle"
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ThreadStateResponse(BaseModel):
    thread_id: str
    messages: List[ChatMessage] = Field(default_factory=list)


class ThreadSearchRequest(BaseModel):
    status: Optional[str] = Field(None, description="Filter by thread status")
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Filter by metadata key-value pairs"
    )
    limit: int = Field(20, ge=1, le=100, description="Maximum results")
    offset: int = Field(0, ge=0, description="Results offset")


class ThreadHistoryRequest(BaseModel):
    limit: int = Field(10, ge=1, le=1000)
    before: Optional[str] = Field(
        None, description="Return states before this checkpoint ID"
    )
    metadata: Optional[Dict[str, Any]] = None
    checkpoint: Optional[Dict[str, Any]] = None
    checkpoint_ns: Optional[str] = None


class ThreadState(BaseModel):
    """A checkpoint state snapshot — returned by the history endpoint."""

    values: Dict[str, Any] = Field(default_factory=dict)
    next: List[str] = Field(default_factory=list)
    checkpoint: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    parent_checkpoint: Optional[Dict[str, Any]] = None
    tasks: List[Dict[str, Any]] = Field(default_factory=list)


class CreateRunRequest(BaseModel):
    assistant_id: str = Field(..., description="Which assistant to invoke")
    input: Dict[str, Any] = Field(
        ...,
        description="Input payload. Typically: {'messages': [{'role': 'user', 'content': '...'}]}",
    )
    stream: bool = Field(False, description="Enable streaming response")
    config: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Runtime config overrides"
    )


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_id: str
    thread_id: str
    status: str = "completed"
    assistant_id: Optional[str] = None
    output: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
