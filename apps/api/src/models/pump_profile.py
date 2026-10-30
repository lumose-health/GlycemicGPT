"""Story 15.8: Pump profile model.

Stores pump settings profiles synced from Tandem t:connect, including
time-segmented basal rates, correction factors, carb ratios, and target BG.
"""

import math
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.treatment_safety.models import MAX_GLUCOSE_MGDL, MIN_GLUCOSE_MGDL
from src.models.base import Base, TimestampMixin

# Marks a segment written by the current profile writers (Nightscout
# import, Tandem sync), which store unknown values as JSON null. On a
# segment that carries it, a stored 0 basal is a real 0 U/h setting. Older segments
# used 0 to mean "not known" for every field, and nothing on the row says
# which source wrote them, so a 0 basal there stays unknown.
SEGMENT_UNKNOWN_AS_NULL_KEY = "unknown_as_null"


def _number_or_none(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if not math.isfinite(value):
        return None
    return value


def known_segment_values(seg: dict) -> dict[str, float | None]:
    """Return a stored segment's basal_rate, correction_factor, carb_ratio
    and target_bg with every unknown value as None.

    Unknown means null, missing, non-numeric, non-finite or negative.
    Correction factor, carb ratio and target are never valid at 0, so a
    0 there is always unknown, and a target outside 20-500 mg/dL is
    dropped rather than clamped. A 0 basal is a real setting only on a
    segment written with `SEGMENT_UNKNOWN_AS_NULL_KEY`; on a legacy
    segment it was the "not known" sentinel and stays unknown.
    """
    out: dict[str, float | None] = {}
    for key in ("correction_factor", "carb_ratio", "target_bg"):
        value = _number_or_none(seg.get(key))
        out[key] = value if value is not None and value > 0 else None
    target = out["target_bg"]
    if target is not None and not MIN_GLUCOSE_MGDL <= target <= MAX_GLUCOSE_MGDL:
        out["target_bg"] = None
    basal = _number_or_none(seg.get("basal_rate"))
    if basal is not None and (
        basal < 0 or (basal == 0 and seg.get(SEGMENT_UNKNOWN_AS_NULL_KEY) is not True)
    ):
        basal = None
    # + 0.0 turns a stored -0.0 into 0.0 so it never prints as "-0.000".
    out["basal_rate"] = basal + 0.0 if basal is not None else None
    return out


class PumpProfile(Base, TimestampMixin):
    """Stores a pump settings profile from Tandem t:connect.

    Each profile contains time-segmented insulin delivery settings
    (basal rates, correction factors, carb ratios, target BG) stored
    as a JSONB array in the segments column.
    """

    __tablename__ = "pump_profiles"

    __table_args__ = (
        UniqueConstraint("user_id", "profile_name", name="uq_pump_profile_user_name"),
    )

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

    profile_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # Time-segmented settings as JSONB array
    # Each element: {time, start_minutes, basal_rate, correction_factor,
    #                carb_ratio, target_bg, unknown_as_null}
    # An unknown value is null; read values through known_segment_values.
    segments: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )

    insulin_duration_min: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    carb_entry_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    max_bolus_units: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    cgm_high_alert_mgdl: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    cgm_low_alert_mgdl: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    user = relationship("User", back_populates="pump_profiles")

    def __repr__(self) -> str:
        return (
            f"<PumpProfile(user_id={self.user_id}, name={self.profile_name!r}, "
            f"active={self.is_active}, segments={len(self.segments or [])})>"
        )
