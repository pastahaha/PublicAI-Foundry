import re
from typing import Annotated
from urllib.parse import quote_plus

from pydantic import BeforeValidator, computed_field
from src.config.base_settings import EnvBaseSettings


def parse_lower(v: str) -> str:
    return v.strip().lower() if isinstance(v, str) else v


def parse_upper(v: str) -> str:
    return v.strip().upper() if isinstance(v, str) else v


LowerStr = Annotated[str, BeforeValidator(parse_lower)]
UpperStr = Annotated[str, BeforeValidator(parse_upper)]


class DatabaseSettings(EnvBaseSettings):
    """PostgreSQL connection settings.

    Supports:
    1. DATABASE_URL — standard for containerised deployments
    2. Individual POSTGRES_* vars — local development
    """

    DATABASE_URL: str | None = None

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "Nappy@2435"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "publicai_foundry"
    DB_ECHO_LOG: bool = False

    @staticmethod
    def _normalize_scheme(url: str, target_scheme: str) -> str:
        return re.sub(r"^postgres(?:ql)?(\+\w+)?://", f"{target_scheme}://", url)

    @computed_field
    @property
    def database_url(self) -> str:
        """Async URL for SQLAlchemy (asyncpg)."""
        if self.DATABASE_URL:
            return self._normalize_scheme(self.DATABASE_URL, "postgresql+asyncpg")
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{password}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field
    @property
    def database_url_sync(self) -> str:
        """Plain libpq connection string for psycopg3 / LangGraph pool."""
        if self.DATABASE_URL:
            # Strip any SQLAlchemy driver suffix so psycopg gets a raw libpq URL
            return self._normalize_scheme(self.DATABASE_URL, "postgresql")
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql://{self.POSTGRES_USER}:{password}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
