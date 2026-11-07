"""Story 5.3: Daily brief model.

Stores AI-generated daily glucose analysis briefs.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin


class DailyBrief(Base, TimestampMixin):
    """Stores daily AI-generated glucose analysis briefs.

    Each brief covers a 24-hour period and includes calculated metrics
    from glucose readings and pump events, plus AI-generated analysis.
    """

    __tablename__ = "daily_briefs"

    __table_args__ = (Index("ix_daily_briefs_user_period", "user_id", "period_start"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Analysis period
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Calculated glucose metrics
    time_in_range_pct: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    average_glucose: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    low_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    high_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    readings_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Control-IQ summary
    correction_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    total_insulin: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    basal_estimate_complete: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # AI output
    ai_summary: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    ai_model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    ai_provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # Token usage tracking
    input_tokens: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    output_tokens: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Relationship to user
    user = relationship("User", back_populates="daily_briefs")

    def __repr__(self) -> str:
        return (
            f"<DailyBrief(user_id={self.user_id}, "
            f"period={self.period_start} to {self.period_end}, "
            f"tir={self.time_in_range_pct}%)>"
        )
