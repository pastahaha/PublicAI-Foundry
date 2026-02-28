"""Voice Controller — ElevenLabs voice endpoints for the orchestrator.

The supervisor/builder agent can accept voice input (STT) and return
voice output (TTS). These endpoints wrap the orchestrator's /start
and /continue with audio in/out.

Endpoints:
  POST /voice/orchestrator/start     — Start with voice input → voice+text response
  POST /voice/orchestrator/continue  — Continue with voice input → voice+text response
  POST /voice/tts                    — Convert text to speech (standalone)
  POST /voice/stt                    — Convert speech to text (standalone)
  GET  /voice/voices                 — List available ElevenLabs voices
  GET  /voice/status                 — Check if voice is configured
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from src.core.models.orchestrator import OrchestratorMessageRequest
from src.core.orm import get_session
from src.services.voice_service import (
    is_voice_configured,
    list_voices,
    speech_to_text,
    text_to_speech,
)

logger = logging.getLogger(__name__)

voice_router = APIRouter(prefix="/voice", tags=["voice"])


# ── Response models ──────────────────────────────────────────────────


class VoiceOrchestratorResponse(BaseModel):
    """Response from voice orchestrator — includes text + audio URL."""

    thread_id: str
    phase: str
    message: str = Field("", description="The assistant's text response")
    questions: list[str] = Field(default_factory=list)
    has_blueprint: bool = False
    has_audio: bool = False
    audio_content_type: str = "audio/mpeg"
    use_case: Optional[str] = None


class TTSRequest(BaseModel):
    """Standalone text-to-speech request."""

    text: str = Field(..., min_length=1, description="Text to convert to speech")
    voice_id: Optional[str] = Field(
        None, description="ElevenLabs voice ID (default: Rachel)"
    )


class STTResponse(BaseModel):
    """Response from speech-to-text."""

    text: str
    language: str = "en"


# ── GET /voice/status ────────────────────────────────────────────────


@voice_router.get("/status")
async def voice_status():
    """Check if ElevenLabs voice is configured and available."""
    configured = is_voice_configured()
    return {
        "configured": configured,
        "provider": "elevenlabs" if configured else None,
        "message": (
            "ElevenLabs is configured and ready."
            if configured
            else "ELEVENLABS_API_KEY environment variable is not set."
        ),
    }


# ── GET /voice/voices ───────────────────────────────────────────────


@voice_router.get("/voices")
async def get_voices():
    """List available ElevenLabs voices."""
    if not is_voice_configured():
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )
    try:
        voices = await list_voices()
        return {"voices": voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list voices: {e}")


# ── POST /voice/stt ──────────────────────────────────────────────────


@voice_router.post("/stt", response_model=STTResponse)
async def convert_speech_to_text(
    audio: UploadFile = File(..., description="Audio file (WAV, MP3, WebM, OGG)"),
    language: str = Form("en", description="Language code"),
):
    """Convert an audio file to text using ElevenLabs STT."""
    if not is_voice_configured():
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )

    audio_data = await audio.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    logger.info(
        "🎙️ STT request: %d bytes, content_type=%s", len(audio_data), audio.content_type
    )

    try:
        text = await speech_to_text(audio_data, language_code=language)
        return STTResponse(text=text, language=language)
    except Exception as e:
        logger.error("STT failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Speech-to-text failed: {e}")


# ── POST /voice/tts ──────────────────────────────────────────────────


@voice_router.post("/tts")
async def convert_text_to_speech(req: TTSRequest):
    """Convert text to speech audio using ElevenLabs TTS.

    Returns raw MP3 audio bytes with audio/mpeg content type.
    """
    if not is_voice_configured():
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )

    logger.info("🔊 TTS request: %d chars", len(req.text))

    try:
        audio_bytes = await text_to_speech(
            text=req.text,
            voice_id=req.voice_id or "21m00Tcm4TlvDq8ikWAM",
        )
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=response.mp3",
            },
        )
    except Exception as e:
        logger.error("TTS failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Text-to-speech failed: {e}")


# ── POST /voice/orchestrator/start ───────────────────────────────────


@voice_router.post("/orchestrator/start")
async def voice_orchestrator_start(
    audio: UploadFile = File(..., description="Audio file with use-case description"),
    model_provider: str = Form("ollama"),
    model_name: str = Form("qwen2.5:3b"),
    use_case: Optional[str] = Form(None),
    skip_clarification: bool = Form(False),
    language: str = Form("en"),
    session: AsyncSession = Depends(get_session),
):
    """Start orchestrator session with voice input.

    1. Transcribes audio → text (STT)
    2. Runs the orchestrator (same as POST /orchestrator/start)
    3. Converts the response to audio (TTS)
    4. Returns both text response and audio

    Response: JSON with text fields + audio bytes as a separate download.
    """
    if not is_voice_configured():
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )

    # 1. STT
    audio_data = await audio.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    logger.info("🎙️ Voice orchestrator START: %d bytes audio", len(audio_data))
    user_text = await speech_to_text(audio_data, language_code=language)
    logger.info("🎙️ Transcribed: '%s'", user_text[:300])

    if not user_text.strip():
        raise HTTPException(
            status_code=400, detail="Could not transcribe audio — no speech detected"
        )

    # 2. Run orchestrator
    from src.controllers.v1.orchestrator_controller import (
        start_orchestrator,
    )

    req = OrchestratorMessageRequest(
        message=user_text,
        model_provider=model_provider,
        model_name=model_name,
        use_case=use_case,
        skip_clarification=skip_clarification,
    )

    orch_response = await start_orchestrator(req, session)

    # 3. TTS on the response
    response_text = orch_response.message or "I'm processing your request."
    try:
        audio_response = await text_to_speech(response_text)
        has_audio = True
    except Exception as e:
        logger.warning("TTS failed, returning text only: %s", e)
        audio_response = b""
        has_audio = False

    # 4. Return JSON with text + audio
    import base64

    return {
        "thread_id": orch_response.thread_id,
        "phase": orch_response.phase,
        "message": orch_response.message,
        "transcribed_input": user_text,
        "questions": orch_response.questions,
        "has_blueprint": orch_response.has_blueprint,
        "blueprint": orch_response.blueprint,
        "use_case": orch_response.use_case,
        "has_audio": has_audio,
        "audio_base64": (
            base64.b64encode(audio_response).decode() if has_audio else None
        ),
        "audio_content_type": "audio/mpeg",
    }


# ── POST /voice/orchestrator/continue ────────────────────────────────


@voice_router.post("/orchestrator/continue")
async def voice_orchestrator_continue(
    audio: UploadFile = File(..., description="Audio file with user's answer"),
    thread_id: str = Form(..., description="Thread ID from /start"),
    model_provider: str = Form("ollama"),
    model_name: str = Form("qwen2.5:3b"),
    use_case: Optional[str] = Form(None),
    language: str = Form("en"),
    session: AsyncSession = Depends(get_session),
):
    """Continue orchestrator session with voice input.

    1. Transcribes audio → text (STT)
    2. Runs the orchestrator continue (same as POST /orchestrator/continue)
    3. Converts the response to audio (TTS)
    4. Returns both text response and audio
    """
    if not is_voice_configured():
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )

    # 1. STT
    audio_data = await audio.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    logger.info(
        "🎙️ Voice orchestrator CONTINUE: %d bytes audio (thread=%s)",
        len(audio_data),
        thread_id,
    )
    user_text = await speech_to_text(audio_data, language_code=language)
    logger.info("🎙️ Transcribed: '%s'", user_text[:300])

    if not user_text.strip():
        raise HTTPException(
            status_code=400, detail="Could not transcribe audio — no speech detected"
        )

    # 2. Run orchestrator continue
    from src.controllers.v1.orchestrator_controller import (
        continue_orchestrator,
    )

    req = OrchestratorMessageRequest(
        message=user_text,
        thread_id=thread_id,
        model_provider=model_provider,
        model_name=model_name,
        use_case=use_case,
        skip_clarification=True,
    )

    orch_response = await continue_orchestrator(req, session)

    # 3. TTS on the response
    response_text = orch_response.message or "Processing..."
    try:
        audio_response = await text_to_speech(response_text)
        has_audio = True
    except Exception as e:
        logger.warning("TTS failed, returning text only: %s", e)
        audio_response = b""
        has_audio = False

    # 4. Return JSON + audio
    import base64

    return {
        "thread_id": orch_response.thread_id,
        "phase": orch_response.phase,
        "message": orch_response.message,
        "transcribed_input": user_text,
        "questions": orch_response.questions,
        "has_blueprint": orch_response.has_blueprint,
        "blueprint": orch_response.blueprint,
        "use_case": orch_response.use_case,
        "has_audio": has_audio,
        "audio_base64": (
            base64.b64encode(audio_response).decode() if has_audio else None
        ),
        "audio_content_type": "audio/mpeg",
    }
