"""Skills API — list and inspect the built-in skill catalogue.

Routes:
  GET  /api/v1/skills/           — list all skills (Level 1 metadata)
  GET  /api/v1/skills/{skill_id} — get a single skill (full Level 2 detail)
  GET  /api/v1/skills/categories — list skill categories
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from src.services.skill_catalogue import (
    BUILT_IN_SKILLS,
    get_skill,
    get_categories,
    get_skills_by_category,
)

logger = logging.getLogger(__name__)

skills_router = APIRouter(prefix="/skills", tags=["skills"])


@skills_router.get("/")
async def list_skills(category: str | None = None):
    """Return all skills (optionally filtered by category)."""
    if category:
        skills = get_skills_by_category(category)
    else:
        skills = BUILT_IN_SKILLS
    return [s.to_dict() for s in skills]


@skills_router.get("/categories")
async def list_categories():
    """Return all unique skill categories."""
    return get_categories()


@skills_router.get("/{skill_id}")
async def get_skill_detail(skill_id: str):
    """Return full detail for a single skill (Level 2)."""
    skill = get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return {
        **skill.to_dict(),
        "level2_prompt": skill.level2_prompt,
        "level3_resources": skill.level3_resources,
    }
