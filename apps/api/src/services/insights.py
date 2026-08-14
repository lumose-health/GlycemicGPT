"""Stories 5.7-5.8: AI insights service.

Aggregates AI analyses into a unified insights feed, tracks
user responses (acknowledge/dismiss), and provides detailed
reasoning & audit views for individual insights.
"""

import uuid
from collections.abc import Callable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.logging_config import get_logger
from src.models.correction_analysis import CorrectionAnalysis
from src.models.daily_brief import DailyBrief
from src.models.meal_analysis import MealAnalysis
from src.models.safety_log import SafetyLog
from src.models.suggestion_response import SuggestionResponse
from src.schemas.suggestion_response import (
    InsightDetail,
    InsightSummary,
    ModelInfo,
    SafetyInfo,
    UserResponseInfo,
)

logger = get_logger(__name__)

# Map analysis type to its model class
ANALYSIS_MODELS: dict[str, type] = {
    "daily_brief": DailyBrief,
    "meal_analysis": MealAnalysis,
    "correction_analysis": CorrectionAnalysis,
}


def _brief_title(brief: DailyBrief) -> str:
    """Generate a title for a daily brief."""
    return f"Daily Brief — {brief.period_end.strftime('%b %d, %Y')}"


def _meal_title(analysis: MealAnalysis) -> str:
    """Generate a title for a meal analysis."""
    return f"Meal Pattern Analysis — {analysis.total_spikes} spike{'s' if analysis.total_spikes != 1 else ''} detected"


def _correction_title(analysis: CorrectionAnalysis) -> str:
    """Generate a title for a correction analysis."""
    return f"Correction Factor Analysis — {analysis.total_corrections} correction{'s' if analysis.total_corrections != 1 else ''} analyzed"


async def count_unread_insights(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Count insights that have no user response (status = pending).

    Counts all daily briefs, meal analyses, and correction analyses
    that the user has NOT acknowledged or dismissed.

    Args:
        user_id: User's UUID.
        db: Database session.

    Returns:
        Number of unread (pending) insights.
    """
    total = 0

    for analysis_type, model in ANALYSIS_MODELS.items():
        # Count total analyses for this type
        count_result = await db.execute(
            select(func.count(model.id)).where(model.user_id == user_id)
        )
        type_total = count_result.scalar() or 0

        # Count responses for this type
        responded_result = await db.execute(
            select(func.count(SuggestionResponse.id)).where(
                SuggestionResponse.user_id == user_id,
                SuggestionResponse.analysis_type == analysis_type,
            )
        )
        type_responded = responded_result.scalar() or 0

        total += type_total - type_responded

    return max(total, 0)


async def list_insights(
    user_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 10,
    analysis_type: str | None = None,
) -> tuple[list[InsightSummary], int]:
    """List recent AI insights aggregated from all analysis types.

    Combines daily briefs, meal analyses, and correction analyses
    into a unified feed sorted by creation date.

    Args:
        user_id: User's UUID.
        db: Database session.
        limit: Maximum insights to return.
        analysis_type: Optional analysis type to return.

    Returns:
        Tuple of (insights list, total count).
    """
    insights: list[InsightSummary] = []

    # Fetch recent daily briefs
    briefs_result = await db.execute(
        select(DailyBrief)
        .where(DailyBrief.user_id == user_id)
        .order_by(DailyBrief.created_at.desc())
        .limit(limit)
    )
    briefs = list(briefs_result.scalars().all())

    # Fetch recent meal analyses
    meals_result = await db.execute(
        select(MealAnalysis)
        .where(MealAnalysis.user_id == user_id)
        .order_by(MealAnalysis.created_at.desc())
        .limit(limit)
    )
    meals = list(meals_result.scalars().all())

    # Fetch recent correction analyses
    corrections_result = await db.execute(
        select(CorrectionAnalysis)
        .where(CorrectionAnalysis.user_id == user_id)
        .order_by(CorrectionAnalysis.created_at.desc())
        .limit(limit)
    )
    corrections = list(corrections_result.scalars().all())

    # Collect all fetched IDs for scoped response lookup
    all_ids = (
        [brief.id for brief in briefs]
        + [meal.id for meal in meals]
        + [c.id for c in corrections]
    )

    # Fetch responses only for the fetched analyses (F6: scoped query)
    response_map: dict[tuple[str, uuid.UUID], str] = {}
    if all_ids:
        responses_result = await db.execute(
            select(
                SuggestionResponse.analysis_type,
                SuggestionResponse.analysis_id,
                SuggestionResponse.response,
            ).where(
                SuggestionResponse.user_id == user_id,
                SuggestionResponse.analysis_id.in_(all_ids),
            )
        )
        for row in responses_result.all():
            response_map[(row[0], row[1])] = row[2]

    # Build unified insights
    for brief in briefs:
        insight_status = response_map.get(("daily_brief", brief.id), "pending")
        insights.append(
            InsightSummary(
                id=brief.id,
                analysis_type="daily_brief",
                title=_brief_title(brief),
                content=brief.ai_summary,
                created_at=brief.created_at,
                status=insight_status,
            )
        )

    for meal in meals:
        insight_status = response_map.get(("meal_analysis", meal.id), "pending")
        insights.append(
            InsightSummary(
                id=meal.id,
                analysis_type="meal_analysis",
                title=_meal_title(meal),
                content=meal.ai_analysis,
                created_at=meal.created_at,
                status=insight_status,
            )
        )

    for correction in corrections:
        insight_status = response_map.get(
            ("correction_analysis", correction.id), "pending"
        )
        insights.append(
            InsightSummary(
                id=correction.id,
                analysis_type="correction_analysis",
                title=_correction_title(correction),
                content=correction.ai_analysis,
                created_at=correction.created_at,
                status=insight_status,
            )
        )

    if analysis_type is not None:
        insights = [
            insight for insight in insights if insight.analysis_type == analysis_type
        ]

    # Sort by created_at descending and limit
    insights.sort(key=lambda x: x.created_at, reverse=True)
    total = len(insights)
    insights = insights[:limit]

    return insights, total


async def verify_analysis_ownership(
    user_id: uuid.UUID,
    analysis_type: str,
    analysis_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Verify that an analysis exists and belongs to the user.

    Args:
        user_id: User's UUID.
        analysis_type: Type of analysis.
        analysis_id: ID of the analysis.
        db: Database session.

    Raises:
        HTTPException: 404 if not found or not owned by user.
    """
    model = ANALYSIS_MODELS.get(analysis_type)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid analysis type: {analysis_type}",
        )

    result = await db.execute(
        select(model.id).where(
            model.id == analysis_id,
            model.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )


async def record_suggestion_response(
    user_id: uuid.UUID,
    analysis_type: str,
    analysis_id: uuid.UUID,
    response: str,
    reason: str | None,
    db: AsyncSession,
) -> SuggestionResponse:
    """Record a user's response to an AI suggestion.

    If the user has already responded to this analysis, returns 409 Conflict.

    Args:
        user_id: User's UUID.
        analysis_type: Type of analysis (daily_brief, meal_analysis, correction_analysis).
        analysis_id: ID of the analysis.
        response: User's response (acknowledged or dismissed).
        reason: Optional reason for the response.
        db: Database session.

    Returns:
        The created SuggestionResponse record.

    Raises:
        HTTPException: 409 if a response already exists.
    """
    # Check for existing response (F3: prevent duplicates)
    existing = await get_response_for_analysis(user_id, analysis_type, analysis_id, db)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A response has already been recorded for this analysis",
        )

    entry = SuggestionResponse(
        user_id=user_id,
        analysis_type=analysis_type,
        analysis_id=analysis_id,
        response=response,
        reason=reason,
    )

    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    logger.info(
        "Suggestion response recorded",
        user_id=str(user_id),
        analysis_type=analysis_type,
        analysis_id=str(analysis_id),
        response=response,
    )

    return entry


async def get_response_for_analysis(
    user_id: uuid.UUID,
    analysis_type: str,
    analysis_id: uuid.UUID,
    db: AsyncSession,
) -> SuggestionResponse | None:
    """Get the user's response for a specific analysis.

    Args:
        user_id: User's UUID.
        analysis_type: Type of analysis.
        analysis_id: ID of the analysis.
        db: Database session.

    Returns:
        The SuggestionResponse if found, None otherwise.
    """
    result = await db.execute(
        select(SuggestionResponse).where(
            SuggestionResponse.user_id == user_id,
            SuggestionResponse.analysis_type == analysis_type,
            SuggestionResponse.analysis_id == analysis_id,
        )
    )
    return result.scalar_one_or_none()


def _extract_data_context(analysis_type: str, record: object) -> dict:
    """Extract data context dict from an analysis record."""
    if analysis_type == "daily_brief":
        return {
            "time_in_range_pct": record.time_in_range_pct,
            "average_glucose": record.average_glucose,
            "low_count": record.low_count,
            "high_count": record.high_count,
            "readings_count": record.readings_count,
            "correction_count": record.correction_count,
            "total_insulin": record.total_insulin,
        }
    if analysis_type == "meal_analysis":
        return {
            "total_boluses": record.total_boluses,
            "total_spikes": record.total_spikes,
            "avg_post_meal_peak": record.avg_post_meal_peak,
            "meal_periods_data": record.meal_periods_data,
        }
    # correction_analysis
    return {
        "total_corrections": record.total_corrections,
        "under_corrections": record.under_corrections,
        "over_corrections": record.over_corrections,
        "avg_observed_isf": record.avg_observed_isf,
        "time_periods_data": record.time_periods_data,
    }


def _get_content(analysis_type: str, record: object) -> str:
    """Get the AI-generated content from an analysis record."""
    if analysis_type == "daily_brief":
        return record.ai_summary
    return record.ai_analysis


# Title generators indexed by type for convenience
_TITLE_FNS: dict[str, Callable[..., str]] = {
    "daily_brief": _brief_title,
    "meal_analysis": _meal_title,
    "correction_analysis": _correction_title,
}


async def get_insight_detail(
    user_id: uuid.UUID,
    analysis_type: str,
    analysis_id: uuid.UUID,
    db: AsyncSession,
) -> InsightDetail:
    """Get detailed view of a single AI insight with reasoning and audit data.

    Includes analysis period, data context used for the analysis,
    AI model info, safety validation status, and user response.

    Args:
        user_id: User's UUID.
        analysis_type: Type of analysis.
        analysis_id: ID of the analysis.
        db: Database session.

    Returns:
        InsightDetail with full reasoning and audit information.

    Raises:
        HTTPException: 400 for invalid type, 404 if not found.
    """
    model = ANALYSIS_MODELS.get(analysis_type)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid analysis type: {analysis_type}",
        )

    # Fetch the analysis record
    result = await db.execute(
        select(model).where(
            model.id == analysis_id,
            model.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )

    # Build title
    title_fn = _TITLE_FNS[analysis_type]
    title = title_fn(record)

    # Extract data context
    data_context = _extract_data_context(analysis_type, record)

    # Model info
    model_info = ModelInfo(
        model=record.ai_model,
        provider=record.ai_provider,
        input_tokens=record.input_tokens,
        output_tokens=record.output_tokens,
    )

    # Fetch safety log
    safety_result = await db.execute(
        select(SafetyLog).where(
            SafetyLog.user_id == user_id,
            SafetyLog.analysis_type == analysis_type,
            SafetyLog.analysis_id == analysis_id,
        )
    )
    safety_record = safety_result.scalar_one_or_none()
    safety = None
    if safety_record is not None:
        safety = SafetyInfo(
            status=safety_record.status,
            has_dangerous_content=safety_record.has_dangerous_content,
            flagged_items=safety_record.flagged_items,
            validated_at=safety_record.created_at,
        )

    # Fetch user response
    user_response_record = await get_response_for_analysis(
        user_id, analysis_type, analysis_id, db
    )
    user_response = None
    insight_status = "pending"
    if user_response_record is not None:
        insight_status = user_response_record.response
        user_response = UserResponseInfo(
            response=user_response_record.response,
            reason=user_response_record.reason,
            responded_at=user_response_record.created_at,
        )

    return InsightDetail(
        id=record.id,
        analysis_type=analysis_type,
        title=title,
        content=_get_content(analysis_type, record),
        created_at=record.created_at,
        status=insight_status,
        period_start=record.period_start,
        period_end=record.period_end,
        data_context=data_context,
        model_info=model_info,
        safety=safety,
        user_response=user_response,
    )
