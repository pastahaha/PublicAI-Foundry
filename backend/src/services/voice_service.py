"""Voice Service — ElevenLabs integration for STT (speech-to-text) and TTS (text-to-speech).

Used by the orchestrator's voice endpoints so users can speak to the
builder agent and hear responses back.

Requires:
  - ELEVENLABS_API_KEY environment variable
  - elevenlabs Python package

The service wraps ElevenLabs' streaming TTS and uses their STT API
(or falls back to a simple approach for hackathon purposes).
"""

from __future__ import annotations

import io
import logging
import os
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# Default voice — "Rachel" is a clear, warm female voice.
# Change to any ElevenLabs voice ID you prefer.
DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel
DEFAULT_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")


def _get_api_key() -> str:
    """Return the ElevenLabs API key or raise."""
    key = ELEVENLABS_API_KEY or os.getenv("ELEVENLABS_API_KEY", "")
    if not key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not set. "
            "Set it as an environment variable to enable voice features."
        )
    return key


# ── TTS: Text → Audio ───────────────────────────────────────────────


async def text_to_speech(
    text: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL_ID,
    output_format: str = "mp3_44100_128",
) -> bytes:
    """Convert text to speech audio bytes using ElevenLabs API.

    Returns raw audio bytes (MP3 by default).
    """
    api_key = _get_api_key()
    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}"

    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            json=payload,
            headers=headers,
            params={"output_format": output_format},
        )

        if response.status_code != 200:
            logger.error(
                "ElevenLabs TTS failed: %d %s",
                response.status_code,
                response.text[:500],
            )
            raise RuntimeError(
                f"ElevenLabs TTS error {response.status_code}: {response.text[:200]}"
            )

        logger.info(
            "🔊 TTS: %d chars → %d bytes audio",
            len(text),
            len(response.content),
        )
        return response.content


async def text_to_speech_stream(
    text: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL_ID,
    output_format: str = "mp3_44100_128",
) -> AsyncIterator[bytes]:
    """Stream TTS audio chunks from ElevenLabs.

    Yields raw audio chunks as they arrive — useful for real-time playback.
    """
    api_key = _get_api_key()
    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}/stream"

    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            url,
            json=payload,
            headers=headers,
            params={"output_format": output_format},
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise RuntimeError(
                    f"ElevenLabs TTS stream error {response.status_code}: {body[:200]}"
                )
            async for chunk in response.aiter_bytes(chunk_size=4096):
                yield chunk


# ── STT: Audio → Text ───────────────────────────────────────────────


async def speech_to_text(
    audio_data: bytes,
    language_code: str = "en",
) -> str:
    """Convert audio to text using ElevenLabs Speech-to-Text API.

    Accepts audio bytes (WAV, MP3, WebM, OGG, etc.).
    Returns the transcribed text string.
    """
    api_key = _get_api_key()
    url = f"{ELEVENLABS_BASE_URL}/speech-to-text"

    headers = {
        "xi-api-key": api_key,
    }

    # ElevenLabs STT uses multipart form data
    files = {
        "file": ("audio.wav", io.BytesIO(audio_data), "audio/wav"),
    }
    data = {
        "language_code": language_code,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            files=files,
            data=data,
            headers=headers,
        )

        if response.status_code != 200:
            logger.error(
                "ElevenLabs STT failed: %d %s",
                response.status_code,
                response.text[:500],
            )
            raise RuntimeError(
                f"ElevenLabs STT error {response.status_code}: {response.text[:200]}"
            )

        result = response.json()
        text = result.get("text", "")
        logger.info("🎙️ STT: %d bytes audio → '%s'", len(audio_data), text[:200])
        return text


# ── Utility ──────────────────────────────────────────────────────────


def is_voice_configured() -> bool:
    """Check whether ElevenLabs is configured."""
    key = ELEVENLABS_API_KEY or os.getenv("ELEVENLABS_API_KEY", "")
    return bool(key)


async def list_voices() -> list[dict]:
    """List available ElevenLabs voices."""
    api_key = _get_api_key()
    url = f"{ELEVENLABS_BASE_URL}/voices"

    headers = {"xi-api-key": api_key}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            raise RuntimeError(f"Failed to list voices: {response.status_code}")

        data = response.json()
        voices = data.get("voices", [])
        return [
            {
                "voice_id": v["voice_id"],
                "name": v["name"],
                "category": v.get("category", ""),
                "description": v.get("description", ""),
                "preview_url": v.get("preview_url", ""),
            }
            for v in voices
        ]
