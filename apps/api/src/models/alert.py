"""Story 6.2: Predictive alert model.

Stores generated alerts from the predictive alert engine,
including glucose trajectory predictions and IoB risk assessments.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base


class AlertType(str, enum.Enum):
    """Type of alert triggered."""

    LOW_URGENT = "low_urgent"
    LOW_WARNING = "low_warning"
    HIGH_WARNING = "high_warning"
    HIGH_URGENT = "high_urgent"
    IOB_WARNING = "iob_warning"
    # GLY-137: glucose data stopped arriving at the backend for a
    # caregiver-monitored patient ("lost contact"). Caregiver-only delivery;
    # the patient sees staleness on their own dashboard instead.
    NO_DATA = "no_data"


class AlertSeverity(str, enum.Enum):
    """Severity level for alert escalation."""

    INFO = "info"
    WARNING = "warning"
    URGENT = "urgent"
    EMERGENCY = "emergency"


class Alert(Base):
    """Stores predictive and threshold-based alerts.

    Each alert records the current and predicted values, the timeframe
    of the prediction, and whether the user has acknowledged it.
    """

    __tablename__ = "alerts"

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

    alert_type: Mapped[AlertType] = mapped_column(
        Enum(
            AlertType,
            name="alerttype",
            create_type=False,
            values_callable=lambda e: [member.value for member in e],
        ),
        nullable=False,
    )

    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alertseverity",
            create_type=False,
            values_callable=lambda e: [member.value for member in e],
        ),
        nullable=False,
    )

    # Current glucose value at time of alert (mg/dL)
    current_value: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # Predicted glucose value (mg/dL) - null for IoB-only alerts
    predicted_value: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Minutes into the future for the prediction
    prediction_minutes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # IoB at time of alert (units) - null if unavailable
    iob_value: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Human-readable alert message
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # Trend rate at time of alert (mg/dL/min)
    trend_rate: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Source of alert: "predictive", "current", "iob", "data_gap"
    source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="predictive",
    )

    # Acknowledgment tracking
    acknowledged: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Alert creation timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Expiration - alerts auto-expire after this time
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Relationships
    user = relationship("User", back_populates="alerts")
    escalation_events = relationship("EscalationEvent", back_populates="alert")

    def __repr__(self) -> str:
        return (
            f"<Alert(type={self.alert_type.value}, "
            f"severity={self.severity.value}, "
            f"current={self.current_value}, "
            f"predicted={self.predicted_value})>"
        )
