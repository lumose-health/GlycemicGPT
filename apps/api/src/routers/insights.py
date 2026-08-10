"""Stories 5.7-5.8: AI insights router.

Provides endpoints for listing AI insights, viewing insight details
with reasoning & audit data, and recording user responses.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.auth import get_current_user, require_diabetic_or_admin
from src.database import get_db
from src.models.user import User
from src.schemas.suggestion_response import (
    InsightDetail,
    InsightsListResponse,
    SuggestionResponseRequest,
    SuggestionResponseResponse,
)
from src.services.insights import (
    count_unread_insights,
    get_insight_detail,
    list_insights,
    record_suggestion_response,
    verify_analysis_ownership,
)

router = APIRouter(prefix="/api/ai/insights", tags=["insights"])

VALID_ANALYSIS_TYPES = {"daily_brief", "meal_analysis", "correction_analysis"}


@router.get(
    "/unread-count",
    dependencies=[Depends(require_diabetic_or_admin)],
)
async def get_unread_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Get the count of unread (pending) insights.

    Returns the number of insights the user has not yet
    acknowledged or dismissed.
    """
    count = await count_unread_insights(user.id, db)
    return {"unread_count": count}


@router.get(
    "",
    response_model=InsightsListResponse,
    dependencies=[Depends(require_diabetic_or_admin)],
)
async def get_insights(
    limit: int = Query(default=10, ge=1, le=100),
    analysis_type: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InsightsListResponse:
    """List recent AI insights for the current user.

    Aggregates daily briefs, meal analyses, and correction analyses
    into a unified insights feed.
    """
    if analysis_type is not None and analysis_type not in VALID_ANALYSIS_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid analysis type: {analysis_type}. "
            f"Must be one of: {', '.join(sorted(VALID_ANALYSIS_TYPES))}",
        )

    insights, total = await list_insights(
        user.id,
        db,
        limit=limit,
        analysis_type=analysis_type,
    )
    return InsightsListResponse(insights=insights, total=total)


@router.get(
    "/{analysis_type}/{analysis_id}",
    response_model=InsightDetail,
    dependencies=[Depends(require_diabetic_or_admin)],
)
async def get_insight(
    analysis_type: str,
    analysis_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InsightDetail:
    """Get detailed view of a single AI insight.

    Returns full reasoning, data context, model info,
    safety validation status, and user response history.
    """
    if analysis_type not in VALID_ANALYSIS_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid analysis type: {analysis_type}. "
            f"Must be one of: {', '.join(sorted(VALID_ANALYSIS_TYPES))}",
        )

    return await get_insight_detail(user.id, analysis_type, analysis_id, db)


@router.post(
    "/{analysis_type}/{analysis_id}/respond",
    response_model=SuggestionResponseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_diabetic_or_admin)],
)
async def respond_to_insight(
    analysis_type: str,
    analysis_id: uuid.UUID,
    body: SuggestionResponseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuggestionResponseResponse:
    """Record a user's response to an AI insight.

    Accepts 'acknowledged' or 'dismissed' as valid responses.
    """
    if analysis_type not in VALID_ANALYSIS_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid analysis type: {analysis_type}. "
            f"Must be one of: {', '.join(sorted(VALID_ANALYSIS_TYPES))}",
        )

    # Verify the analysis exists and belongs to this user (F4)
    await verify_analysis_ownership(user.id, analysis_type, analysis_id, db)

    entry = await record_suggestion_response(
        user_id=user.id,
        analysis_type=analysis_type,
        analysis_id=analysis_id,
        response=body.response,
        reason=body.reason,
        db=db,
    )

    return SuggestionResponseResponse.model_validate(entry)
