"""Server-side idempotency substrate for user-authored creates.

The reusable half of the Idempotency-Key contract (the transport half is
``core.idempotency``): a central lookup + stage pair that any create endpoint
wires in with zero new schema. Today's consumers are the food-photo create and
save-as-common-food; the net-new creates in later stories call the same two
functions.

Contract for a call site:

1. Key present -> ``find_idempotent_resource``. A hit means this exact request
   was already processed: raise ``IdempotentReplay`` (or return the pointer)
   BEFORE any expensive side effect (vision call, photo store).
2. Miss -> run the create, then ``stage_idempotency_key`` in the SAME session
   and let the existing single commit write the domain row and the key row
   atomically -- if either fails, neither persists.
3. Commit raises ``IntegrityError`` -> rollback, re-``find_idempotent_resource``;
   a row now existing means a concurrent same-key request won the race --
   replay it. The pre-SELECT in (1) is a cost optimization; the UNIQUE
   constraint is the correctness guarantee.

Safety framing: a replayed offline create that double-inserts a meal inflates
carb -> IOB history, a dosing input. This module exists so that can't happen.
It must never be conflated with ``pump_event_dedupe`` (a content hash with the
opposite semantic -- see the model docstring).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.idempotency_key import IdempotencyKey

# Stable endpoint slugs -- the `endpoint` dimension of the unique key. Never
# derive these from the request path (fragile to trailing slashes/versioning).
FOOD_RECORDS_CREATE = "food_records.create"
COMMON_FOODS_CREATE_FROM_RECORD = "common_foods.create_from_record"

# resource_type discriminators for the polymorphic pointer.
RESOURCE_FOOD_RECORD = "food_record"
RESOURCE_COMMON_FOOD = "common_food"


class IdempotentReplay(Exception):  # noqa: N818 -- control-flow signal, not an error
    """This keyed create was already processed -- replay, don't re-create.

    Deliberately an exception rather than a return value so a create service
    can signal "already done" from anywhere in its pipeline (the pre-vision
    short-circuit AND the commit-race loser path) without threading a replay
    flag through every return type. The router catches it and builds the
    replay response from the carried pointer: re-fetch the resource
    owner-scoped, re-serialize, original status, ``Idempotent-Replayed: true``.
    """

    def __init__(self, key: IdempotencyKey) -> None:
        super().__init__(f"idempotent replay for {key.endpoint}")
        self.key = key


async def find_idempotent_resource(
    db: AsyncSession,
    user_id: uuid.UUID,
    endpoint: str,
    client_request_id: str,
) -> IdempotencyKey | None:
    """Return the processed-create pointer for this exact request, if any."""
    return await db.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.client_request_id == client_request_id,
        )
    )


def stage_idempotency_key(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    endpoint: str,
    client_request_id: str,
    resource_type: str,
    resource_id: uuid.UUID,
    response_status: int,
) -> IdempotencyKey:
    """Add (NOT commit) the key row to the caller's session.

    The caller owns the transaction: its single existing commit must write the
    domain row and this key row atomically, so a crash between them can't
    strand a key pointing at nothing (or a row with no key).
    """
    key = IdempotencyKey(
        user_id=user_id,
        endpoint=endpoint,
        client_request_id=client_request_id,
        resource_type=resource_type,
        resource_id=resource_id,
        response_status=response_status,
    )
    db.add(key)
    return key
