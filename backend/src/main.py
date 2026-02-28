from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.routers.publicai_foundry_router import publicai_foundry_router
import structlog
from contextlib import asynccontextmanager
from src.core.database import db_manager

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("server.starting")

    await db_manager.initialize()
    await db_manager.create_tables()

    logger.info("server.ready")

    yield

    logger.info("server.shutting_down")

    await db_manager.close()
    logger.info("server.stopped")


app = FastAPI(
    title="PublicAI Foundry API",
    description="API for the PublicAI Foundry project, providing endpoints for AI model interactions and data management.",
    version="1.0.0",
    docs_url="/swagger",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(publicai_foundry_router, prefix="/api")
