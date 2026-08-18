"""POST /explain — single file document explanation via Gemini."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..middleware.auth import get_current_user
from ..models.schemas import ExplainRequest, ExplainResponse, FileItem
from ..services import gemini as gemini_svc
from ..services.heuristics import run_heuristics

logger = logging.getLogger(__name__)
router = APIRouter(tags=["explain"])

# Generous estimate for a single explain call
_EXPLAIN_TOKEN_ESTIMATE = 300


@router.post("/explain", response_model=ExplainResponse)
async def explain_file(
    body: ExplainRequest,
    user: dict = Depends(get_current_user),
) -> ExplainResponse:
    """
    Explain what a file likely contains and suggest organisation.
    If the file is unambiguous by extension/keyword, a short heuristic
    explanation is returned (0 tokens used).
    """
    user_id: str = user["sub"]

    # Quick heuristic shortcut for obvious types
    probe = FileItem(
        id="explain-probe",
        name=body.filename,
        extension=body.extension,
        size=body.size,
        modified_at=0,
    )
    heuristic_hits, ambiguous = run_heuristics([probe])

    if heuristic_hits and not body.content_preview:
        hit = heuristic_hits[0]
        return ExplainResponse(
            summary=f"{hit.reason}.",
            suggested_category=hit.category,
            suggested_name=hit.new_name,
            suggested_folder=hit.target_folder,
            confidence=hit.confidence,
            tokens_used=0,
        )

    try:
        result, _ = await gemini_svc.explain_file(
            filename=body.filename,
            extension=body.extension,
            size=body.size,
            content_preview=body.content_preview,
            user_id=user_id,
            endpoint="/explain",
        )
    except Exception as exc:
        logger.exception("Gemini explain failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI explanation failed: {exc}",
        )

    return result
