"""Schemas for idempotent-replay responses."""

import uuid

from pydantic import BaseModel


class IdempotentTombstoneResponse(BaseModel):
    """Terminal replay body for a keyed create whose resource was since deleted.

    The retry is "already processed" (never re-create -- that would resurrect a
    deliberately-deleted meal), but there is nothing left to return. The client's
    outbox/reconcile treats this as done-with-nothing-to-bind.
    """

    replayed: bool = True
    resource_deleted: bool = True
    resource_type: str
    resource_id: uuid.UUID
