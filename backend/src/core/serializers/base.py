from abc import ABC, abstractmethod
from typing import Any


class Serializer(ABC):
    @abstractmethod
    def serialize(self, obj: Any) -> str:
        """Convert an object to a string representation."""
        pass

    @abstractmethod
    def deserialize(self, data: str) -> Any:
        """Convert a string representation back to an object."""
        pass


class SerializationError(Exception):
    """Custom exception for serialization errors."""

    def __init__(self, message: str, obj_type: str):
        super().__init__(message)
        self.obj_type = obj_type


class GeneralSerializer(Serializer):
    """A general-purpose serializer that can be extended for specific types."""

    def serialize(self, obj: Any) -> str:
        try:
            return self._serialize_object(obj)
        except Exception as e:
            raise SerializationError(
                f"Failed to serialize object of type {type(obj).__name__}: {e}",
                obj_type=type(obj).__name__,
            ) from e

    def _serialize_object(self, obj: Any) -> Any:
        if hasattr(obj, "model_dump") and callable(obj.model_dump):
            return obj.model_dump()
        elif hasattr(obj, "dict") and callable(obj.dict):
            return obj.dict()
        elif (
            obj.__class__.__name__ == "Interrupt"
            and hasattr(obj, "value")
            and hasattr(obj, "id")
        ):
            return {"value": self._serialize_object(obj.value), "id": obj.id}
        elif hasattr(obj, "_asdict") and callable(obj._asdict):
            return {k: self._serialize_object(v) for k, v in obj._asdict().items()}
        elif isinstance(obj, (set, frozenset)):
            return list(obj)
        elif isinstance(obj, (tuple, list)):
            return [self._serialize_object(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: self._serialize_object(v) for k, v in obj.items()}
        elif isinstance(obj, (str, int, float, bool, type(None))):
            return obj
        else:
            return str(obj)

    def deserialize(self, data: str) -> Any:
        return data
