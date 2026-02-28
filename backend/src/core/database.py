import structlog
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from src.config.database_settings import DatabaseSettings


logger = structlog.get_logger(__name__)

_settings = DatabaseSettings()


class DatabaseManager:
    """Manages database connections and LangGraph persistence components."""

    def __init__(self) -> None:
        self.engine: AsyncEngine | None = None
        self.lg_pool: AsyncConnectionPool | None = None
        self._checkpointer: AsyncPostgresSaver | None = None
        self._store: AsyncPostgresStore | None = None

    async def initialize(self) -> None:
        """Initialize database connections and LangGraph components."""
        if self.engine:
            return  # idempotent

        # 1. SQLAlchemy engine (asyncpg) — for ORM metadata tables
        self.engine = create_async_engine(
            _settings.database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            echo=_settings.DB_ECHO_LOG,
        )

        # 2. Shared psycopg pool — for LangGraph checkpointer + store
        lg_max = 10
        lg_kwargs = {
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
        }

        self.lg_pool = AsyncConnectionPool(
            conninfo=_settings.database_url_sync,
            min_size=2,
            max_size=lg_max,
            open=False,
            kwargs=lg_kwargs,
            check=AsyncConnectionPool.check_connection,
        )
        await self.lg_pool.open()

        logger.info("langgraph.pool.init", max_conns=lg_max)

        # 3. Checkpointer
        self._checkpointer = AsyncPostgresSaver(conn=self.lg_pool)
        await self._checkpointer.setup()

        # 4. Store (no semantic index for now — plain key-value)
        self._store = AsyncPostgresStore(conn=self.lg_pool)
        await self._store.setup()

        logger.info("database.initialized")

    async def create_tables(self) -> None:
        """Create ORM tables if they don't exist (Thread, Run, RunEvent)."""
        from src.core.orm import Base

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database.tables_created")

    async def close(self) -> None:
        """Shut down all connections."""
        if self.engine:
            await self.engine.dispose()
            self.engine = None

        if self.lg_pool:
            await self.lg_pool.close()
            self.lg_pool = None
            self._checkpointer = None
            self._store = None

        logger.info("database.closed")

    def get_checkpointer(self) -> AsyncPostgresSaver:
        if self._checkpointer is None:
            raise RuntimeError(
                "Database not initialized — call await db_manager.initialize() first"
            )
        return self._checkpointer

    def get_store(self) -> AsyncPostgresStore:
        if self._store is None:
            raise RuntimeError(
                "Database not initialized — call await db_manager.initialize() first"
            )
        return self._store

    def get_engine(self) -> AsyncEngine:
        if not self.engine:
            raise RuntimeError(
                "Database not initialized — call await db_manager.initialize() first"
            )
        return self.engine


# ── Global singleton ─────────────────────────────────────────────────
db_manager = DatabaseManager()
