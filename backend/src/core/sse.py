import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from src.core.serializers.base import GeneralSerializer
from pytz import UTC

_serializer = GeneralSerializer()


def get_sse_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Last-Event-ID",
        "X-Accel-Buffering": "no",
    }


def format_sse_message(
    event: str,
    data: Any,
    event_id: str | None = None,
    serializer: Callable[[Any], Any] | None = None,
) -> str:
    lines: list[str] = [f"event: {event}"]

    if data is None:
        data_str = ""
    else:
        default_serializer = serializer or _serializer.serialize
        data_str = json.dumps(
            data, default=default_serializer, separators=(",", ":"), ensure_ascii=False
        )
    lines.append(f"data: {data_str}")

    if event_id:
        lines.append(f"id: {event_id}")

    lines.append("")
    return "\n".join(lines) + "\n"


def create_metadata_event(
    run_id: str, event_id: str | None = None, attempt: int = 1
) -> str:
    return format_sse_message(
        "metadata", {"run_id": run_id, "attempt": attempt}, event_id
    )


def create_end_event(event_id: str | None = None) -> str:
    return format_sse_message("end", {"status": "success"}, event_id)


def create_error_event(error: str | dict[str, Any], event_id: str | None = None) -> str:
    if isinstance(error, dict):
        data = {
            "error": error.get("error", "Error"),
            "message": error.get("message", str(error)),
        }
    else:
        data = {"error": "Error", "message": str(error)}
    return format_sse_message("error", data, event_id)


def create_messages_event(
    messages_data: Any, event_type: str = "messages", event_id: str | None = None
) -> str:
    if isinstance(messages_data, tuple) and len(messages_data) == 2:
        message_chunk, metadata = messages_data
        data = [message_chunk, metadata]
        return format_sse_message(event_type, data, event_id)
    return format_sse_message(event_type, messages_data, event_id)


def create_debug_event(debug_data: dict[str, Any], event_id: str | None = None) -> str:
    return format_sse_message("debug", debug_data, event_id)


@dataclass
class SSEEvent:
    """SSE event data structure for storage."""

    id: str
    event: str
    data: dict[str, Any]
    timestamp: datetime | None = None

    def __post_init__(self) -> None:
        if self.timestamp is None:
            self.timestamp = datetime.now(UTC)
