import asyncio
from typing import Any, Dict, Optional
from datetime import datetime, timedelta


class NetworkCachingService:
    _instance: Optional["NetworkCachingService"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        if not self._initialized:
            self._cache: Dict[str, Dict[str, Any]] = {}
            self._cache_lock = asyncio.Lock()
            self._initialized = True

    def __new__(cls) -> "NetworkCachingService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def _is_cache_valid(self, key: str) -> bool:
        if key not in self._cache:
            return False
        entry = self._cache[key]
        return datetime.now() < entry["expires_at"]

    async def get(self, key: str) -> Optional[Any]:
        async with self._cache_lock:
            if self._is_cache_valid(key):
                return self._cache[key]["value"]
            elif key in self._cache:
                del self._cache[key]
            return None

    async def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        async with self._cache_lock:
            expires_at = datetime.now() + timedelta(seconds=ttl) if ttl else None
            self._cache[key] = {"value": value, "expires_at": expires_at}

    async def has_valid_cache(self, key: str) -> bool:
        """Check if key exists and has valid (non-expired) cache"""
        async with self._cache_lock:
            cache_entry = self._cache.get(key)
            return self._is_cache_valid(cache_entry)

    async def clear_all(self) -> None:
        """Clear all cached data"""
        async with self._cache_lock:
            self._cache.clear()

    async def clear_key(self, key: str) -> None:
        """Clear cache for a specific key"""
        async with self._cache_lock:
            self._cache.pop(key, None)

    async def clear_keys_with_prefix(self, prefix: str) -> None:
        """Clear all cache entries that start with the given prefix"""
        async with self._cache_lock:
            keys_to_clear = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_clear:
                self._cache.pop(k, None)
