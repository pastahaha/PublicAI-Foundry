from fastapi import APIRouter
from src.controllers.health_controller import health_router
from src.controllers.v1.agent_chat_controller import (
    agent_chat_router as v1_agent_chat_router,
)
from src.controllers.v1.assistant_controller import (
    assistant_router as v1_assistant_router,
)
from src.controllers.v1.knowledge_base_controller import (
    kb_router as v1_kb_router,
)
from src.controllers.v1.orchestrator_controller import (
    orchestrator_router as v1_orchestrator_router,
)
from src.controllers.v1.orchestrator_chat_controller import (
    orchestrator_chat_router as v1_orchestrator_chat_router,
)

# Voice controller — disabled for now (requires elevenlabs dependency)
# from src.controllers.v1.voice_controller import (
#     voice_router as v1_voice_router,
# )

publicai_foundry_router = APIRouter()
v1_router = APIRouter(prefix="/v1", tags=["v1"])
v1_router.include_router(v1_assistant_router)
v1_router.include_router(v1_orchestrator_router)
v1_router.include_router(v1_orchestrator_chat_router)
v1_router.include_router(v1_kb_router)
v1_router.include_router(v1_agent_chat_router)
# v1_router.include_router(v1_voice_router)  # Disabled until ElevenLabs is needed
publicai_foundry_router.include_router(v1_router)
publicai_foundry_router.include_router(health_router)
