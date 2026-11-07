"""Story 5.4: Meal pattern analysis router.

API endpoints for post-meal glucose pattern recognition and carb ratio suggestions.
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.auth import DiabeticOrAdminUser
from src.database import get_db
from src.middleware.rate_limit import limiter
from src.schemas.auth import ErrorResponse
from src.schemas.meal_analysis import (
    AnalyzeMealsRequest,
    MealAnalysisListResponse,
    MealAnalysisResponse,
)
from src.services.meal_analysis import (
    generate_meal_analysis,
    get_meal_analysis_by_id,
    list_meal_analyses,
)

router = APIRouter(prefix="/api/ai/meals", tags=["ai-meals"])


@router.post(
    "/analyze",
    response_model=MealAnalysisResponse,
    status_code=201,
    responses={
        201: {"description": "Meal pattern analysis generated"},
        400: {"model": ErrorResponse, "description": "Insufficient meal data"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        403: {"model": ErrorResponse, "description": "Permission denied"},
        404: {"model": ErrorResponse, "description": "No AI provider configured"},
        503: {"model": ErrorResponse, "description": "Meal matching timed out"},
    },
)
@limiter.limit("5/minute")
async def analyze_meals(
    request: Request,
    payload: AnalyzeMealsRequest,
    current_user: DiabeticOrAdminUser,
    db: AsyncSession = Depends(get_db),
) -> MealAnalysisResponse:
    """Analyze post-meal glucose patterns and generate carb ratio suggestions.

    Examines meal boluses and subsequent glucose readings to identify
    post-meal spike patterns grouped by meal period.
    """
    analysis = await generate_meal_analysis(current_user, db, days=payload.days)
    return MealAnalysisResponse.model_validate(analysis)


@router.get(
    "",
    response_model=MealAnalysisListResponse,
    responses={
        200: {"description": "List of meal analyses"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        403: {"model": ErrorResponse, "description": "Permission denied"},
    },
)
async def get_meal_analyses(
    current_user: DiabeticOrAdminUser,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> MealAnalysisListResponse:
    """List meal pattern analyses for the current user."""
    analyses, total = await list_meal_analyses(
        current_user.id, db, limit=limit, offset=offset
    )
    return MealAnalysisListResponse(
        analyses=[MealAnalysisResponse.model_validate(a) for a in analyses],
        total=total,
    )


@router.get(
    "/{analysis_id}",
    response_model=MealAnalysisResponse,
    responses={
        200: {"description": "Meal analysis details"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        403: {"model": ErrorResponse, "description": "Permission denied"},
        404: {"model": ErrorResponse, "description": "Analysis not found"},
    },
)
async def get_meal_analysis(
    analysis_id: uuid.UUID,
    current_user: DiabeticOrAdminUser,
    db: AsyncSession = Depends(get_db),
) -> MealAnalysisResponse:
    """Get a specific meal pattern analysis by ID."""
    analysis = await get_meal_analysis_by_id(analysis_id, current_user.id, db)
    return MealAnalysisResponse.model_validate(analysis)
