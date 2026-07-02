"""Idempotency-key tests for user-authored creates (offline-outbox replay safety).

The point of the substrate under test: a retried create with the same
``Idempotency-Key`` header -- most importantly the offline outbox replaying
after a dropped response -- must be exactly-once. A double-inserted meal would
inflate carb (and downstream IOB) history, a dosing input.

Covers the header contract, keyed create + replay (one row, one image, one
vision call), the indeterminate-commit retry (the motivating scenario), the
concurrent same-key race, cross-endpoint isolation, the deleted-resource edge,
and the pump/push content-hash non-regression (request idempotency and
content dedupe must never be conflated).
"""

import asyncio
import json
import uuid
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.idempotency import get_idempotency_key
from src.database import get_db_session
from src.main import app
from src.models.ai_provider import (
    AIProviderConfig,
    AIProviderStatus,
    AIProviderType,
)
from src.models.common_food import CommonFood
from src.models.food_record import FoodRecord
from src.models.idempotency_key import IdempotencyKey
from src.services import food_vision, idempotency


# --------------------------------------------------------------------------- #
# Helpers (mirroring test_food_records.py)
# --------------------------------------------------------------------------- #
def _png_bytes(size: tuple[int, int] = (16, 16), color=(120, 40, 40)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _estimate_json(low=40, high=55, desc="a bowl of pasta"):
    return json.dumps(
        {
            "food_description": desc,
            "carbs_grams_low": low,
            "carbs_grams_high": high,
            "confidence": "high",
            "assumptions": "standard restaurant portion",
            "nutrition": {"protein_grams": 12, "calories": 520},
        }
    )


def unique_email(prefix: str = "idem") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def _register_login(client: AsyncClient) -> str:
    email = unique_email()
    await client.post(
        "/api/auth/register", json={"email": email, "password": "SecurePass123"}
    )
    resp = await client.post(
        "/api/auth/login", json={"email": email, "password": "SecurePass123"}
    )
    return resp.cookies.get(settings.jwt_cookie_name)


async def _current_user_id(client: AsyncClient) -> uuid.UUID:
    resp = await client.get("/api/auth/me")
    return uuid.UUID(resp.json()["id"])


async def _add_provider(db, user_id: uuid.UUID):
    db.add(
        AIProviderConfig(
            user_id=user_id,
            provider_type=AIProviderType.CLAUDE_API,
            model_name="claude-sonnet-4-5-20250929",
            status=AIProviderStatus.CONNECTED,
        )
    )
    await db.commit()


@pytest.fixture
def _uploads_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    return tmp_path


@pytest_asyncio.fixture
async def auth_client(_uploads_tmp, db_session):
    """An authenticated client with an AI provider configured."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cookie = await _register_login(client)
        client.cookies.set(settings.jwt_cookie_name, cookie)
        user_id = await _current_user_id(client)
        await _add_provider(db_session, user_id)
        yield client, user_id


async def _upload(
    client: AsyncClient, key: str | None = None, image: bytes | None = None
):
    headers = {"Idempotency-Key": key} if key is not None else {}
    return await client.post(
        "/api/food-records",
        files={
            "file": (
                "meal.png",
                image if image is not None else _png_bytes(),
                "image/png",
            )
        },
        headers=headers,
    )


async def _count(model, user_id: uuid.UUID) -> int:
    """Count rows in a fresh session (the shared ``db_session`` fixture lives
    on the session-scoped loop; opening here keeps IO on the test's loop)."""
    async with get_db_session() as db:
        return await db.scalar(
            select(func.count()).select_from(model).where(model.user_id == user_id)
        )


async def _food_row_count(user_id: uuid.UUID) -> int:
    return await _count(FoodRecord, user_id)


async def _key_row_count(user_id: uuid.UUID) -> int:
    return await _count(IdempotencyKey, user_id)


async def _common_food_count(user_id: uuid.UUID) -> int:
    return await _count(CommonFood, user_id)


def _stored_image_count() -> int:
    root = Path(settings.upload_dir)
    if not root.exists():
        return 0
    return sum(1 for p in root.rglob("*") if p.is_file())


# --------------------------------------------------------------------------- #
# AC2 -- the Idempotency-Key header contract
# --------------------------------------------------------------------------- #
class TestIdempotencyKeyHeaderContract:
    async def test_absent_header_is_normal_create(self, auth_client):
        """Golden regression: no header -> unchanged non-idempotent create."""
        client, user_id = auth_client
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client)
            r2 = await _upload(client)
        assert r1.status_code == 201
        assert r2.status_code == 201
        # Two identical unkeyed uploads are two REAL meals -- they must both
        # persist (content-based dedupe here would be a clinical carb
        # undercount) and no key rows appear.
        assert r1.json()["id"] != r2.json()["id"]
        assert await _food_row_count(user_id) == 2
        assert await _key_row_count(user_id) == 0
        assert "Idempotent-Replayed" not in r1.headers

    async def test_empty_header_is_422_with_string_detail(self, auth_client):
        client, _ = auth_client
        vision = AsyncMock(return_value=_estimate_json())
        with patch.object(food_vision, "_call_vision", vision):
            resp = await _upload(client, key="")
        assert resp.status_code == 422
        assert isinstance(resp.json()["detail"], str)
        vision.assert_not_awaited()

    async def test_oversized_header_is_422_with_string_detail(self, auth_client):
        client, _ = auth_client
        resp = await _upload(client, key="k" * 65)
        assert resp.status_code == 422
        assert isinstance(resp.json()["detail"], str)

    async def test_max_length_key_accepted(self, auth_client):
        client, _ = auth_client
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            resp = await _upload(client, key="k" * 64)
        assert resp.status_code == 201

    async def test_whitespace_only_header_rejected(self):
        # Unit-level (whitespace-only values are awkward to send over real
        # HTTP): the dependency must treat a blank-after-strip key as malformed.
        with pytest.raises(HTTPException) as exc_info:
            await get_idempotency_key("   ")
        assert exc_info.value.status_code == 422
        assert isinstance(exc_info.value.detail, str)

    async def test_absent_value_passes_through_as_none(self):
        assert await get_idempotency_key(None) is None

    async def test_surrounding_whitespace_is_stripped(self):
        assert await get_idempotency_key(" abc ") == "abc"


# --------------------------------------------------------------------------- #
# AC3 / AC4 / AC6 -- keyed create then replay
# --------------------------------------------------------------------------- #
class TestKeyedCreateReplay:
    async def test_replay_returns_same_record_once_only(self, auth_client):
        client, user_id = auth_client
        key = str(uuid.uuid4())
        # Patch at the samples level so awaits map 1:1 to requests.
        samples = AsyncMock(return_value=[_estimate_json()])
        with patch.object(food_vision, "_call_vision_samples", samples):
            r1 = await _upload(client, key=key)
            r2 = await _upload(client, key=key)

        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]
        assert "Idempotent-Replayed" not in r1.headers
        assert r2.headers.get("Idempotent-Replayed") == "true"

        # Exactly once: one row, one stored image, one vision round.
        assert await _food_row_count(user_id) == 1
        assert _stored_image_count() == 1
        assert samples.await_count == 1

    async def test_replay_short_circuits_before_image_validation(self, auth_client):
        """The replay must not depend on re-validating the payload: a retry
        whose image bytes got corrupted still returns the original record."""
        client, user_id = auth_client
        key = str(uuid.uuid4())
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client, key=key)
            r2 = await _upload(client, key=key, image=b"corrupted-not-an-image")
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r2.json()["id"] == r1.json()["id"]
        assert await _food_row_count(user_id) == 1

    async def test_replay_is_a_live_refetch_not_a_snapshot(self, auth_client):
        """AC4: the key row stores a pointer; a replay serves the record's
        CURRENT state (here: a correction applied between create and retry)."""
        client, _ = auth_client
        key = str(uuid.uuid4())
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client, key=key)
            record_id = r1.json()["id"]
            corrected = await client.post(
                f"/api/food-records/{record_id}/correct",
                json={"corrected_carbs_low": 10, "corrected_carbs_high": 20},
            )
            assert corrected.status_code == 200
            r2 = await _upload(client, key=key)
        assert r2.json()["id"] == record_id
        assert r2.json()["corrected_carbs_low"] == 10
        assert r2.json()["source"] == "user_corrected"

    async def test_keys_are_user_scoped(self, auth_client):
        """The same key value from two different users is two distinct creates."""
        client, user_id = auth_client
        key = str(uuid.uuid4())
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as other:
            cookie = await _register_login(other)
            other.cookies.set(settings.jwt_cookie_name, cookie)
            other_id = await _current_user_id(other)
            async with get_db_session() as db:
                await _add_provider(db, other_id)
            with patch.object(
                food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
            ):
                r1 = await _upload(client, key=key)
                r2 = await _upload(other, key=key)
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] != r2.json()["id"]
        assert "Idempotent-Replayed" not in r2.headers


# --------------------------------------------------------------------------- #
# The motivating scenario: indeterminate commit -> retry
# --------------------------------------------------------------------------- #
class TestIndeterminateCommitRetry:
    async def test_retry_after_dropped_response_replays_committed_row(
        self, auth_client
    ):
        """The row committed server-side but the client saw an error (dropped
        connection). The keyed retry must replay the committed row -- never
        fail closed, never double-insert."""
        client, user_id = auth_client
        key = str(uuid.uuid4())

        real_commit = AsyncSession.commit

        async def commit_then_drop(self):
            # The commit really happens; the failure is on the response path.
            await real_commit(self)
            raise ConnectionError("simulated response drop after server-side commit")

        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            with patch.object(AsyncSession, "commit", commit_then_drop):
                r1 = await _upload(client, key=key)
            assert r1.status_code == 503  # what the client actually saw

            # The row (and its key row, same transaction) DID land.
            assert await _food_row_count(user_id) == 1

            r2 = await _upload(client, key=key)

        assert r2.status_code == 201
        assert r2.headers.get("Idempotent-Replayed") == "true"
        assert await _food_row_count(user_id) == 1
        assert await _key_row_count(user_id) == 1


# --------------------------------------------------------------------------- #
# AC5 -- concurrent same-key race
# --------------------------------------------------------------------------- #
class TestConcurrentSameKeyRace:
    async def test_forced_race_loser_replays_winner(self, auth_client):
        """Deterministic race: the second request is forced to miss the
        pre-SELECT, so it inserts, hits the UNIQUE constraint, and must
        resolve to the winner's row via the IntegrityError path -- no 500,
        no duplicate, and its orphaned photo is cleaned up."""
        client, user_id = auth_client
        key = str(uuid.uuid4())

        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client, key=key)
            assert r1.status_code == 201
            winner_id = r1.json()["id"]
            assert _stored_image_count() == 1

            real_find = idempotency.find_idempotent_resource
            missed = False

            async def miss_the_preselect_once(db, user_id, endpoint, client_request_id):
                nonlocal missed
                if not missed:
                    missed = True
                    return None  # simulate "the winner hasn't committed yet"
                return await real_find(db, user_id, endpoint, client_request_id)

            with patch.object(
                idempotency, "find_idempotent_resource", miss_the_preselect_once
            ):
                r2 = await _upload(client, key=key)

        assert r2.status_code == 201
        assert r2.json()["id"] == winner_id
        assert r2.headers.get("Idempotent-Replayed") == "true"
        assert await _food_row_count(user_id) == 1
        # The loser's photo was stored pre-commit and must not leak: the race
        # rollback is determinate, so it gets deleted (winner's copy remains).
        assert _stored_image_count() == 1

    async def test_two_concurrent_keyed_requests_yield_one_row(self, auth_client):
        """End-to-end concurrency: whichever interleaving happens (pre-SELECT
        hit or constraint race), both callers get the same resource and
        exactly one row exists."""
        client, user_id = auth_client
        key = str(uuid.uuid4())
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1, r2 = await asyncio.gather(
                _upload(client, key=key), _upload(client, key=key)
            )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]
        assert await _food_row_count(user_id) == 1


# --------------------------------------------------------------------------- #
# AC7 -- cross-endpoint isolation + save-as-common-food (secondary scope)
# --------------------------------------------------------------------------- #
class TestCrossEndpointIsolation:
    async def test_same_key_on_two_endpoints_does_not_collide(self, auth_client):
        client, user_id = auth_client
        key = str(uuid.uuid4())
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client, key=key)
        assert r1.status_code == 201
        record_id = r1.json()["id"]

        # Reusing the exact same key value on a DIFFERENT endpoint must be a
        # fresh create there (the endpoint dimension isolates), never a replay
        # of the food record.
        r2 = await client.post(
            f"/api/food-records/{record_id}/save-as-common-food",
            json={"name": "Oatmeal"},
            headers={"Idempotency-Key": key},
        )
        assert r2.status_code == 201
        assert "Idempotent-Replayed" not in r2.headers
        assert r2.json()["name"] == "Oatmeal"
        assert r2.json()["id"] != record_id
        assert await _key_row_count(user_id) == 2

    async def test_save_as_common_food_keyed_replay(self, auth_client):
        client, user_id = auth_client
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            record_id = (await _upload(client)).json()["id"]

        key = str(uuid.uuid4())
        r1 = await client.post(
            f"/api/food-records/{record_id}/save-as-common-food",
            json={"name": "Oatmeal"},
            headers={"Idempotency-Key": key},
        )
        r2 = await client.post(
            f"/api/food-records/{record_id}/save-as-common-food",
            json={"name": "Oatmeal"},
            headers={"Idempotency-Key": key},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]
        assert r2.headers.get("Idempotent-Replayed") == "true"
        assert await _common_food_count(user_id) == 1

    async def test_name_upsert_survives_alongside_request_idempotency(
        self, auth_client
    ):
        """A DIFFERENT key with an existing name still collapses by name --
        the pre-existing content-level dedupe is retained, layered under the
        new request-level idempotency."""
        client, user_id = auth_client
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            record_id = (await _upload(client)).json()["id"]

        r1 = await client.post(
            f"/api/food-records/{record_id}/save-as-common-food",
            json={"name": "Oatmeal"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        r2 = await client.post(
            f"/api/food-records/{record_id}/save-as-common-food",
            json={"name": "oatmeal  "},  # same normalized name, new key
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]  # name-upsert, not a new row
        assert "Idempotent-Replayed" not in r2.headers  # a real (update) pass
        assert await _common_food_count(user_id) == 1


# --------------------------------------------------------------------------- #
# AC8 -- deleted-resource edge
# --------------------------------------------------------------------------- #
class TestDeletedResourceEdge:
    async def test_replay_of_deleted_record_is_terminal_tombstone(self, auth_client):
        client, user_id = auth_client
        key = str(uuid.uuid4())
        with patch.object(
            food_vision, "_call_vision", AsyncMock(return_value=_estimate_json())
        ):
            r1 = await _upload(client, key=key)
            record_id = r1.json()["id"]

            deleted = await client.delete(f"/api/food-records/{record_id}")
            assert deleted.status_code == 204

            r2 = await _upload(client, key=key)

        # Terminal done/gone: never re-created (a re-create would resurrect a
        # deliberately-deleted meal).
        assert r2.status_code == 200
        body = r2.json()
        assert body["replayed"] is True
        assert body["resource_deleted"] is True
        assert body["resource_type"] == "food_record"
        assert body["resource_id"] == record_id
        assert r2.headers.get("Idempotent-Replayed") == "true"
        assert await _food_row_count(user_id) == 0


# --------------------------------------------------------------------------- #
# AC1 -- schema/migration parity
# --------------------------------------------------------------------------- #
class TestSchemaParity:
    async def test_migration_built_the_constraint_and_index(self):
        """The functional guarantees above run against the ORM; pin that the
        MIGRATED table (what production gets) carries the same named unique
        constraint and index the model declares."""
        async with get_db_session() as db:
            constraint_rows = await db.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'idempotency_keys'::regclass"
                )
            )
            constraint_names = {row[0] for row in constraint_rows}
            index_rows = await db.execute(
                text(
                    "SELECT indexname FROM pg_indexes "
                    "WHERE tablename = 'idempotency_keys'"
                )
            )
            index_names = {row[0] for row in index_rows}
        assert "uq_idempotency_keys_user_endpoint_client_request_id" in constraint_names
        assert "ix_idempotency_keys_user_id" in index_names

    def test_model_mirrors_migration_constraint_name(self):
        unique_constraints = [
            arg
            for arg in IdempotencyKey.__table_args__
            if getattr(arg, "name", None)
            == "uq_idempotency_keys_user_endpoint_client_request_id"
        ]
        assert len(unique_constraints) == 1


# --------------------------------------------------------------------------- #
# AC9 -- pump/push is untouched (content dedupe, not request idempotency)
# --------------------------------------------------------------------------- #
class TestPumpPushUnaffected:
    async def _register_mobile(self, client: AsyncClient) -> tuple[str, uuid.UUID]:
        email = unique_email("pump")
        reg = await client.post(
            "/api/auth/register", json={"email": email, "password": "SecurePass123"}
        )
        assert reg.status_code == 201, reg.text
        resp = await client.post(
            "/api/auth/mobile/login",
            json={"email": email, "password": "SecurePass123"},
        )
        token = resp.json()["access_token"]
        me = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        return token, uuid.UUID(me.json()["id"])

    async def test_header_is_ignored_and_content_dedupe_still_governs(self):
        """pump/push keeps its own content-hash dedupe semantics: the
        Idempotency-Key header must change NOTHING there. Same content with
        different keys still collapses (content hash); different content with
        the same key still persists twice (no request idempotency); and no
        idempotency_keys rows appear."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token, user_id = await self._register_mobile(client)
            auth = {"Authorization": f"Bearer {token}"}
            event = {
                "event_type": "bolus",
                "event_timestamp": "2026-03-01T12:00:03+00:00",
                "units": 2.5,
            }

            # Same content, DIFFERENT keys -> still collapsed by content hash.
            r1 = await client.post(
                "/api/integrations/pump/push",
                headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
                json={"events": [event], "source": "mobile"},
            )
            r2 = await client.post(
                "/api/integrations/pump/push",
                headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
                json={"events": [event], "source": "mobile"},
            )
            assert r1.status_code == 200
            assert r1.json()["accepted"] == 1
            assert r2.status_code == 200
            assert r2.json()["accepted"] == 0
            assert r2.json()["duplicates"] == 1

            # Different content, SAME key -> both persist (no request
            # idempotency on this endpoint).
            shared_key = {"Idempotency-Key": str(uuid.uuid4())}
            distinct = dict(
                event, event_timestamp="2026-03-01T12:05:00+00:00", units=4.0
            )
            distinct2 = dict(
                event, event_timestamp="2026-03-01T12:10:00+00:00", units=6.0
            )
            r3 = await client.post(
                "/api/integrations/pump/push",
                headers={**auth, **shared_key},
                json={"events": [distinct], "source": "mobile"},
            )
            r4 = await client.post(
                "/api/integrations/pump/push",
                headers={**auth, **shared_key},
                json={"events": [distinct2], "source": "mobile"},
            )
            assert r3.json()["accepted"] == 1
            assert r4.json()["accepted"] == 1

            assert await _key_row_count(user_id) == 0
