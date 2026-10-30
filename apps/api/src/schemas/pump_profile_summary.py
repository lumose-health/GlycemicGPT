"""Pump profile summary schemas for mobile consumption."""

from datetime import datetime

from pydantic import BaseModel


class PumpProfileSegment(BaseModel):
    """A single time-segmented profile entry.

    A null value means the setting isn't known (never imported or not
    reported by the pump). A 0 basal_rate is a real 0 U/h setting.
    """

    time: str
    start_minutes: int
    basal_rate: float | None
    correction_factor: float | None = None
    carb_ratio: float | None = None
    target_bg: int | None = None


class PumpProfileSummaryResponse(BaseModel):
    """Flattened pump profile summary for mobile clients."""

    model_config = {"from_attributes": True}

    profile_name: str
    is_active: bool
    dia_minutes: int | None = None
    max_bolus_units: float | None = None
    segments: list[PumpProfileSegment]
    synced_at: datetime
