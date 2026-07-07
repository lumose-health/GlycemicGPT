"""GLY-69: Tests for the AI dosing-safety floor on the chat path.

The floor (``apply_ai_safety_floor``) wires ``validate_ai_suggestion`` into
all four chat handlers. These tests assert on the RETURNED text (not on a
patched validator), so they discriminate: every REJECTED/FLAGGED case fails
on the pre-GLY-69 code, which returned the raw dosing text.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import delete, select

from src.core.units import GlucoseUnit
from src.models.ai_provider import AIProviderType
from src.models.safety_log import SafetyLog
from src.models.user import User
from src.schemas.ai_response import AIResponse, AIUsage
from src.schemas.safety_validation import SafetyStatus
from src.services.safety_validation import apply_ai_safety_floor
from src.services.telegram_chat import (
    SAFETY_DISCLAIMER,
    TELEGRAM_MAX_LENGTH,
    _truncate_response,
    handle_caregiver_chat,
    handle_caregiver_chat_web,
    handle_chat,
    handle_chat_web,
)

# Matches the prescriptive-dose patterns -> REJECTED (whole message replaced).
DANGEROUS_TEXT = "increase your ISF to 45 and take 6 units now"
BLOCKED_SNIPPET = "blocked by the safety system"

# A 30% carb-ratio change -> FLAGGED (warning appended, body kept). A bare
# "increase your ISF to 45" is APPROVED -- the ISF flag needs a from->to pair.
FLAGGED_TEXT = "You could change your carb ratio from 1:10 to 1:7 for breakfast."
WARNING_SNIPPET = "Safety Warning"

BENIGN_TEXT = "Your glucose has been steady in range today. Keep it up."


def _make_ai_response(content: str) -> AIResponse:
    return AIResponse(
        content=content,
        model="claude-sonnet-4-5-20250929",
        provider=AIProviderType.CLAUDE,
        usage=AIUsage(input_tokens=100, output_tokens=50),
    )


def _make_user() -> MagicMock:
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "floor-test@integration.test"
    user.glucose_unit = GlucoseUnit.MGDL
    return user


def _make_bare_db() -> AsyncMock:
    """A session mock whose sync ``add`` doesn't emit un-awaited coroutines."""
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _make_db(user: MagicMock) -> AsyncMock:
    db = _make_bare_db()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    db.execute.return_value = mock_result
    return db


async def _passthrough_citations(db, user_id, content, **kwargs) -> str:
    return content


@pytest.fixture
def _isolate_handler_dependencies():
    """Neutralize context/citation/history dependencies for handler tests.

    The citation verifiers are patched to pass-through so the floor's input is
    exactly the mocked AI text (the glucose verifier could otherwise rewrite
    the very figures these tests assert on).
    """
    with (
        patch(
            "src.services.telegram_chat.build_diabetes_context",
            new=AsyncMock(return_value=""),
        ),
        patch(
            "src.services.telegram_chat.verify_meal_citations",
            new=_passthrough_citations,
        ),
        patch(
            "src.services.telegram_chat.verify_glucose_reading_citations",
            new=_passthrough_citations,
        ),
        patch(
            "src.services.telegram_chat.get_or_create_conversation",
            new=AsyncMock(return_value=uuid.uuid4()),
        ),
        patch(
            "src.services.telegram_chat.get_recent_messages",
            new=AsyncMock(return_value=[]),
        ),
    ):
        yield


def _patch_ai(content: str):
    """Patch get_ai_client to return a client emitting *content*."""
    mock_client = AsyncMock()
    mock_client.generate.return_value = _make_ai_response(content)
    return patch(
        "src.services.telegram_chat.get_ai_client",
        new=AsyncMock(return_value=mock_client),
    )


# ---------------------------------------------------------------------------
# apply_ai_safety_floor unit tests
# ---------------------------------------------------------------------------
class TestApplyAiSafetyFloor:
    """Unit tests for the shared floor helper."""

    @pytest.mark.asyncio
    async def test_rejected_replaces_whole_text(self):
        result = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), DANGEROUS_TEXT, "chat"
        )

        assert result.status is SafetyStatus.REJECTED
        assert BLOCKED_SNIPPET in result.text
        assert "6 units" not in result.text
        assert "ISF to 45" not in result.text
        assert result.safety_block == ""

    @pytest.mark.asyncio
    async def test_flagged_keeps_body_and_appends_warning(self):
        result = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), FLAGGED_TEXT, "chat_web"
        )

        assert result.status is SafetyStatus.FLAGGED
        assert result.body == FLAGGED_TEXT
        assert WARNING_SNIPPET in result.safety_block
        assert "exceeds maximum allowed change" in result.safety_block
        assert result.text.startswith(FLAGGED_TEXT)

    @pytest.mark.asyncio
    async def test_approved_returns_content_without_standing_disclaimer(self):
        """Chat surfaces carry their own disclaimer (D5): the floor must not
        add the analysis-surface SAFETY_DISCLAIMER on top."""
        result = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), BENIGN_TEXT, "chat"
        )

        assert result.status is SafetyStatus.APPROVED
        assert result.text == BENIGN_TEXT
        assert "Safety Notice" not in result.text

    @pytest.mark.asyncio
    async def test_plain_rendering_contains_no_markdown(self):
        rejected = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), DANGEROUS_TEXT, "chat", markdown=False
        )
        flagged = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), FLAGGED_TEXT, "chat", markdown=False
        )

        assert BLOCKED_SNIPPET in rejected.text
        assert "**" not in rejected.text
        assert WARNING_SNIPPET in flagged.safety_block
        assert "**" not in flagged.text

    @pytest.mark.asyncio
    async def test_repeated_flagged_change_renders_one_warning_line(self):
        """A model repeating the same over-limit change must not bloat the
        warning block -- it is appended untruncated on the Telegram surfaces,
        so unbounded repetition would push the message past the length cap."""
        result = await apply_ai_safety_floor(
            _make_bare_db(), uuid.uuid4(), FLAGGED_TEXT * 5, "chat"
        )

        assert result.status is SafetyStatus.FLAGGED
        assert result.safety_block.count("exceeds maximum allowed change") == 1

    @pytest.mark.asyncio
    async def test_audit_row_added_and_committed(self):
        db = _make_bare_db()

        await apply_ai_safety_floor(db, uuid.uuid4(), DANGEROUS_TEXT, "chat")

        added = [call.args[0] for call in db.add.call_args_list]
        logs = [obj for obj in added if isinstance(obj, SafetyLog)]
        assert len(logs) == 1
        assert logs[0].status == SafetyStatus.REJECTED.value
        assert logs[0].analysis_type == "chat"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_commit_failure_never_drops_the_response(self):
        db = _make_bare_db()
        db.commit.side_effect = RuntimeError("db down")

        result = await apply_ai_safety_floor(db, uuid.uuid4(), DANGEROUS_TEXT, "chat")

        assert BLOCKED_SNIPPET in result.text
        db.rollback.assert_awaited()

    @pytest.mark.asyncio
    async def test_audit_row_actually_written(self, db_session):
        """The helper's own commit persists the SafetyLog even on sessions the
        caller never commits (the caregiver surfaces, AC4)."""
        user = User(
            email=f"gly69-{uuid.uuid4().hex}@integration.test",
            hashed_password="x" * 60,  # noqa: S106 -- not a real hash, test-only
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        try:
            await apply_ai_safety_floor(
                db_session, user.id, DANGEROUS_TEXT, "caregiver"
            )

            rows = (
                (
                    await db_session.execute(
                        select(SafetyLog).where(SafetyLog.user_id == user.id)
                    )
                )
                .scalars()
                .all()
            )
            assert len(rows) == 1
            assert rows[0].analysis_type == "caregiver"
            assert rows[0].status == SafetyStatus.REJECTED.value
            assert rows[0].has_dangerous_content is True
        finally:
            await db_session.execute(
                delete(SafetyLog).where(SafetyLog.user_id == user.id)
            )
            await db_session.execute(delete(User).where(User.id == user.id))
            await db_session.commit()


# ---------------------------------------------------------------------------
# Handler wiring -- REJECTED backstop on every chat surface
# ---------------------------------------------------------------------------
@pytest.mark.usefixtures("_isolate_handler_dependencies")
class TestRejectedOnAllSurfaces:
    """A prescriptive dosing response is blocked on all 4 handlers.

    Each case fails on pre-GLY-69 code (raw dosing text was returned).
    """

    @pytest.mark.asyncio
    async def test_handle_chat_blocks_dosing_text(self):
        user = _make_user()
        with (
            _patch_ai(DANGEROUS_TEXT),
            patch("src.services.telegram_chat.store_message", new=AsyncMock()),
        ):
            msg = await handle_chat(_make_db(user), user.id, "How much insulin?")

        assert BLOCKED_SNIPPET in msg
        assert "6 units" not in msg
        assert "ISF to 45" not in msg

    @pytest.mark.asyncio
    async def test_handle_chat_web_blocks_dosing_text(self):
        user = _make_user()
        with (
            _patch_ai(DANGEROUS_TEXT),
            patch("src.services.telegram_chat.store_message", new=AsyncMock()),
        ):
            result = await handle_chat_web(_make_db(user), user.id, "How much?")

        assert BLOCKED_SNIPPET in result.content
        assert "6 units" not in result.content
        assert "ISF to 45" not in result.content

    @pytest.mark.asyncio
    async def test_handle_caregiver_chat_blocks_dosing_text(self):
        patient = _make_user()
        with _patch_ai(DANGEROUS_TEXT):
            msg = await handle_caregiver_chat(
                _make_db(patient), uuid.uuid4(), patient.id, "How much?"
            )

        assert BLOCKED_SNIPPET in msg
        assert "6 units" not in msg
        assert "ISF to 45" not in msg

    @pytest.mark.asyncio
    async def test_handle_caregiver_chat_web_blocks_dosing_text(self):
        patient = _make_user()
        with _patch_ai(DANGEROUS_TEXT):
            msg = await handle_caregiver_chat_web(
                _make_db(patient), uuid.uuid4(), patient.id, "How much?"
            )

        assert BLOCKED_SNIPPET in msg
        assert "6 units" not in msg
        assert "ISF to 45" not in msg


# ---------------------------------------------------------------------------
# Handler wiring -- FLAGGED warning delivery
# ---------------------------------------------------------------------------
@pytest.mark.usefixtures("_isolate_handler_dependencies")
class TestFlaggedWarningDelivery:
    """A >20% ratio change gets a visible warning on both render paths."""

    @pytest.mark.asyncio
    async def test_telegram_flagged_warning_present_and_plain(self):
        user = _make_user()
        with (
            _patch_ai(FLAGGED_TEXT),
            patch("src.services.telegram_chat.store_message", new=AsyncMock()),
        ):
            msg = await handle_chat(_make_db(user), user.id, "Should I change it?")

        assert WARNING_SNIPPET in msg
        assert "exceeds maximum allowed change" in msg
        assert "carb ratio" in msg
        assert "**" not in msg  # Telegram is HTML parse mode, never Markdown

    @pytest.mark.asyncio
    async def test_web_flagged_warning_present(self):
        user = _make_user()
        with (
            _patch_ai(FLAGGED_TEXT),
            patch("src.services.telegram_chat.store_message", new=AsyncMock()),
        ):
            result = await handle_chat_web(_make_db(user), user.id, "Change it?")

        assert result.content.startswith(FLAGGED_TEXT)
        assert WARNING_SNIPPET in result.content

    @pytest.mark.asyncio
    async def test_telegram_warning_survives_truncation(self):
        """A near-ceiling FLAGGED response keeps its warning: the model body
        is truncated, never the safety block (D2). Fails if the floored text
        is fed whole to the truncator."""
        long_flagged = ("lorem ipsum dolor sit amet " * 200) + FLAGGED_TEXT
        assert len(long_flagged) > TELEGRAM_MAX_LENGTH

        user = _make_user()
        with (
            _patch_ai(long_flagged),
            patch("src.services.telegram_chat.store_message", new=AsyncMock()),
        ):
            msg = await handle_chat(_make_db(user), user.id, "Tell me everything")

        assert len(msg) <= TELEGRAM_MAX_LENGTH
        assert "..." in msg
        assert WARNING_SNIPPET in msg
        assert "exceeds maximum allowed change" in msg
        assert msg.endswith(SAFETY_DISCLAIMER)

    @pytest.mark.asyncio
    async def test_telegram_exactly_one_disclaimer(self):
        """One standing disclaimer per message -- the floor's analysis-surface
        disclaimer is suppressed on chat (D5)."""
        user = _make_user()
        for content in (BENIGN_TEXT, FLAGGED_TEXT, DANGEROUS_TEXT):
            with (
                _patch_ai(content),
                patch("src.services.telegram_chat.store_message", new=AsyncMock()),
            ):
                msg = await handle_chat(_make_db(user), user.id, "hi")

            assert msg.count("Not medical advice") == 1
            assert "Safety Notice" not in msg


# ---------------------------------------------------------------------------
# Persistence and robustness
# ---------------------------------------------------------------------------
@pytest.mark.usefixtures("_isolate_handler_dependencies")
class TestPersistenceAndRobustness:
    """The persisted text is the sanitized text; persistence failures never
    bypass the floor."""

    @pytest.mark.asyncio
    async def test_persisted_assistant_message_is_sanitized_flagged(self):
        user = _make_user()
        store = AsyncMock()
        with (
            _patch_ai(FLAGGED_TEXT),
            patch("src.services.telegram_chat.store_message", new=store),
        ):
            await handle_chat(_make_db(user), user.id, "Change my ratio?")

        assistant_content = store.call_args_list[1].args[4]
        assert assistant_content.startswith(FLAGGED_TEXT)
        assert WARNING_SNIPPET in assistant_content

    @pytest.mark.asyncio
    async def test_persisted_assistant_message_is_sanitized_rejected(self):
        user = _make_user()
        store = AsyncMock()
        with (
            _patch_ai(DANGEROUS_TEXT),
            patch("src.services.telegram_chat.store_message", new=store),
        ):
            result = await handle_chat_web(_make_db(user), user.id, "How much?")

        assistant_content = store.call_args_list[1].args[4]
        assert BLOCKED_SNIPPET in assistant_content
        assert "6 units" not in assistant_content
        assert assistant_content == result.content

    @pytest.mark.asyncio
    async def test_floor_applies_when_persist_raises(self):
        """The floor runs before (and independent of) the non-fatal persist
        step: a storage failure still returns the blocked message (AC5)."""
        user = _make_user()
        store = AsyncMock(side_effect=RuntimeError("storage down"))
        with (
            _patch_ai(DANGEROUS_TEXT),
            patch("src.services.telegram_chat.store_message", new=store),
        ):
            msg = await handle_chat(_make_db(user), user.id, "How much?")

        assert BLOCKED_SNIPPET in msg
        assert "6 units" not in msg


# ---------------------------------------------------------------------------
# Audit commit on the caregiver surfaces (AC4)
# ---------------------------------------------------------------------------
@pytest.mark.usefixtures("_isolate_handler_dependencies")
class TestCaregiverAuditCommit:
    """The caregiver handlers/routers never commit their session, so the
    helper must commit the SafetyLog itself or the row is silently dropped."""

    @staticmethod
    def _added_safety_logs(db: AsyncMock) -> list[SafetyLog]:
        return [
            call.args[0]
            for call in db.add.call_args_list
            if isinstance(call.args[0], SafetyLog)
        ]

    @pytest.mark.asyncio
    async def test_caregiver_telegram_audit_committed(self):
        patient = _make_user()
        db = _make_db(patient)
        with _patch_ai(DANGEROUS_TEXT):
            await handle_caregiver_chat(db, uuid.uuid4(), patient.id, "How much?")

        logs = self._added_safety_logs(db)
        assert len(logs) == 1
        assert logs[0].analysis_type == "caregiver"
        assert logs[0].user_id == patient.id
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_caregiver_web_audit_committed(self):
        patient = _make_user()
        db = _make_db(patient)
        with _patch_ai(BENIGN_TEXT):
            await handle_caregiver_chat_web(db, uuid.uuid4(), patient.id, "Status?")

        logs = self._added_safety_logs(db)
        assert len(logs) == 1
        assert logs[0].analysis_type == "caregiver_web"
        assert logs[0].status == SafetyStatus.APPROVED.value
        db.commit.assert_awaited()


# ---------------------------------------------------------------------------
# _truncate_response with a safety block
# ---------------------------------------------------------------------------
class TestTruncateResponseWithSafetyBlock:
    """The safety block reserves budget and is never truncated."""

    def test_block_appended_between_body_and_disclaimer(self):
        result = _truncate_response("body", "\n\nWARNING BLOCK")

        assert result == "body\n\nWARNING BLOCK" + SAFETY_DISCLAIMER

    def test_long_body_truncated_block_intact(self):
        block = "\n\nWARNING BLOCK"
        result = _truncate_response("x" * (TELEGRAM_MAX_LENGTH * 2), block)

        assert len(result) <= TELEGRAM_MAX_LENGTH
        assert result.endswith(block + SAFETY_DISCLAIMER)
        assert "..." in result

    def test_no_block_preserves_existing_behavior(self):
        result = _truncate_response("hello")

        assert result == "hello" + SAFETY_DISCLAIMER

    def test_cut_never_splits_an_html_entity(self):
        """Telegram HTML parse mode rejects a message ending in a partial
        entity like "&am" -- the cut must trim it, not send it."""
        keep = TELEGRAM_MAX_LENGTH - len(SAFETY_DISCLAIMER) - 3
        prefix = "a" * (keep - 2)
        text = prefix + "&amp;" + "z" * 50  # cut lands after "&a"

        result = _truncate_response(text)

        assert result == prefix + "..." + SAFETY_DISCLAIMER

    def test_oversized_block_drops_body_not_block(self):
        """A safety block past the length cap clamps the body budget to zero
        (no negative slice keeping almost the whole body); the block is
        still delivered intact."""
        block = "w" * (TELEGRAM_MAX_LENGTH + 10)

        result = _truncate_response("body text", block)

        assert result == "..." + block + SAFETY_DISCLAIMER
