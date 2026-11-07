"""Unit + integration tests for NightscoutClient.

Two layers:

1. **Unit tests** (the bulk) -- mock `validate_target` so DNS isn't
   touched, then mock `httpx.AsyncClient.request` so HTTP isn't
   touched either. Covers auth headers, pagination params, retry
   policy, error mapping, auto-detect, and cleanup.

2. **Integration tests** (`@pytest.mark.integration`) -- hit the
   local test Nightscout via `NIGHTSCOUT_TEST_URL` env var. Skipped
   if the env var isn't set, so CI doesn't depend on a real instance.
   These tests run against the seeded `~/dev-test/nightscout/` stack
   when developing locally.
"""

from __future__ import annotations

import hashlib
import os
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.models.nightscout_connection import (
    NightscoutApiVersion,
    NightscoutAuthType,
)
from src.services.integrations.nightscout.client import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGES_PER_COLLECTION,
    MAX_RETRIES_5XX,
    MAX_RETRIES_429,
    RETRY_AFTER_CAP_SECONDS,
    NightscoutClient,
    PagedRecords,
    _backoff_delay,
    _parse_retry_after,
    _sha1_api_secret,
)
from src.services.integrations.nightscout.errors import (
    NightscoutAuthError,
    NightscoutNetworkError,
    NightscoutNotFoundError,
    NightscoutRateLimitError,
    NightscoutServerError,
    NightscoutValidationError,
)
from src.services.integrations.nightscout.ssrf import ValidatedTarget

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fake_target(
    *, scheme: str = "https", hostname: str = "ns.example.com", port: int | None = None
) -> ValidatedTarget:
    p = port or (443 if scheme == "https" else 80)
    host_header = f"{hostname}:{port}" if port else hostname
    return ValidatedTarget(
        scheme=scheme,
        hostname=hostname,
        host_header=host_header,
        port=p,
        path_prefix="",
        base_url=f"{scheme}://{host_header}",
    )


def _make_client(
    *,
    auth_type: NightscoutAuthType = NightscoutAuthType.SECRET,
    api_version: NightscoutApiVersion = NightscoutApiVersion.V1,
    credential: str = "test-secret-12chars-long",
    target: ValidatedTarget | None = None,
) -> NightscoutClient:
    """Build a client without going through `create()` (which does DNS)."""
    c = NightscoutClient(
        target=target or _fake_target(),
        auth_type=auth_type,
        credential=credential,
        api_version=api_version,
    )
    c._open()  # noqa: SLF001  -- exercising lifecycle from tests
    return c


def _resp(
    status: int, body: object = None, headers: dict | None = None
) -> httpx.Response:
    """Build a synthetic httpx Response."""
    if body is None:
        content = b""
    elif isinstance(body, bytes):
        content = body
    else:
        import json

        content = json.dumps(body).encode("utf-8")
    return httpx.Response(
        status_code=status,
        content=content,
        headers=headers or {"content-type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


class TestAuthHeaders:
    def test_v1_headers_use_sha1_of_credential(self):
        c = _make_client(auth_type=NightscoutAuthType.SECRET, credential="my-secret")
        headers = c._v1_headers()
        # Compare against an independently-computed SHA-1 to verify it's
        # really the right hash (and the suppressed lint isn't masking
        # an algorithm mistake).
        expected = hashlib.sha1(b"my-secret").hexdigest()  # noqa: S324  # nosemgrep: python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1
        assert headers == {"api-secret": expected}

    def test_v3_headers_use_bearer_token(self):
        c = _make_client(auth_type=NightscoutAuthType.TOKEN, credential="abc.def.ghi")
        assert c._v3_headers() == {"Authorization": "Bearer abc.def.ghi"}

    def test_v1_headers_empty_when_no_credential(self):
        # Public, read-only Nightscout instances (AUTH_DEFAULT_ROLE=readable)
        # need no api-secret header at all -- an absent header, not a hash
        # of an empty string, is the "anonymous" request the server expects.
        c = _make_client(auth_type=NightscoutAuthType.SECRET, credential="")
        assert c._v1_headers() == {}

    def test_v3_headers_empty_when_no_credential(self):
        c = _make_client(auth_type=NightscoutAuthType.TOKEN, credential="")
        assert c._v3_headers() == {}

    def test_sha1_helper_matches_nightscout_protocol(self):
        # The Nightscout test instance uses this exact secret. The
        # SHA-1 below was independently verified against the running
        # instance during development.
        secret = "glycemicgpt-test-secret-min12chars"
        expected = hashlib.sha1(secret.encode()).hexdigest()  # noqa: S324  # nosemgrep: python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1
        assert _sha1_api_secret(secret) == expected


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_create_validates_url_and_returns_open_client(self):
        with patch(
            "src.services.integrations.nightscout.client.validate_target",
            new=AsyncMock(return_value=_fake_target()),
        ):
            c = await NightscoutClient.create(
                base_url="https://ns.example.com",
                auth_type=NightscoutAuthType.SECRET,
                credential="x",
                api_version=NightscoutApiVersion.V1,
            )
        assert c._client is not None
        await c.aclose()
        assert c._client is None

    @pytest.mark.asyncio
    async def test_create_raises_validation_error_on_bad_url(self):
        with (
            patch(
                "src.services.integrations.nightscout.client.validate_target",
                new=AsyncMock(side_effect=ValueError("bad")),
            ),
            pytest.raises(NightscoutValidationError),
        ):
            await NightscoutClient.create(
                base_url="bad",
                auth_type=NightscoutAuthType.SECRET,
                credential="x",
                api_version=NightscoutApiVersion.V1,
            )

    @pytest.mark.asyncio
    async def test_async_context_manager_closes_underlying_client(self):
        with patch(
            "src.services.integrations.nightscout.client.validate_target",
            new=AsyncMock(return_value=_fake_target()),
        ):
            async with await NightscoutClient.create(
                base_url="https://ns.example.com",
                auth_type=NightscoutAuthType.SECRET,
                credential="x",
                api_version=NightscoutApiVersion.V1,
            ) as c:
                assert c._client is not None
            assert c._client is None


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------


class TestErrorMapping:
    @pytest.mark.asyncio
    async def test_401_raises_auth_error(self):
        c = _make_client()
        with (
            patch.object(c._client, "request", new=AsyncMock(return_value=_resp(401))),
            pytest.raises(NightscoutAuthError),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_403_raises_auth_error(self):
        c = _make_client()
        with (
            patch.object(c._client, "request", new=AsyncMock(return_value=_resp(403))),
            pytest.raises(NightscoutAuthError),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_404_raises_not_found_error(self):
        c = _make_client()
        with (
            patch.object(c._client, "request", new=AsyncMock(return_value=_resp(404))),
            pytest.raises(NightscoutNotFoundError),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_transport_error_raises_network_error(self):
        c = _make_client()
        with (
            patch.object(
                c._client,
                "request",
                new=AsyncMock(side_effect=httpx.ConnectError("conn refused")),
            ),
            pytest.raises(NightscoutNetworkError),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_credential_scrubbed_from_network_error_message(self):
        """Defense-in-depth: if h11/httpx leaks the credential into an
        exception message (LocalProtocolError quotes the offending
        header value), NightscoutNetworkError must not propagate the
        raw value -- it gets persisted to last_sync_error and shown
        to caregivers / written to logs."""
        secret = "super-secret-bearer-token-9zk"
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN,
            api_version=NightscoutApiVersion.V3,
            credential=secret,
        )
        err = httpx.RemoteProtocolError(
            f"Illegal header value b'Bearer {secret}\\r\\n'"
        )
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=err)),
            pytest.raises(NightscoutNetworkError) as exc_info,
        ):
            await c._request("GET", "/api/v3/version")
        assert secret not in str(exc_info.value)
        assert "<redacted>" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_network_error_message_not_corrupted_with_no_credential(self):
        """Regression test: `str.replace(self._credential, ...)` on an empty
        credential would insert "<redacted>" between every character of the
        message (`"".replace("", X)` matches everywhere). A public
        connection with no credential must still surface a readable error."""
        c = _make_client(credential="")
        err = httpx.ConnectError("connection refused")
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=err)),
            pytest.raises(NightscoutNetworkError) as exc_info,
        ):
            await c._request("GET", "/api/v1/status.json")
        assert str(exc_info.value) == "connection refused"

    def test_v3_headers_reject_control_chars_in_credential(self):
        """Pre-flight rejection of credentials with embedded CRLF/etc.
        Catches the common copy-paste-with-stray-newline case before
        the credential ever reaches the wire."""
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN,
            credential="bearer-token-with-newline\r\nInjected: header",
        )
        with pytest.raises(NightscoutValidationError, match="control"):
            c._v3_headers()


# ---------------------------------------------------------------------------
# Retry / backoff
# ---------------------------------------------------------------------------


class TestRetryPolicy:
    @pytest.mark.asyncio
    async def test_429_retries_then_succeeds(self):
        c = _make_client()
        responses = [_resp(429), _resp(429), _resp(200, [])]
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),  # don't actually sleep in tests
            ),
        ):
            result = await c.fetch_entries()
        assert result == []

    @pytest.mark.asyncio
    async def test_429_exhausts_budget_raises_rate_limit_error(self):
        c = _make_client()
        # MAX_RETRIES_429 + 1 = 4 attempts before giving up.
        responses = [_resp(429, headers={"Retry-After": "30"})] * (MAX_RETRIES_429 + 1)
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),
            ),
            pytest.raises(NightscoutRateLimitError) as exc_info,
        ):
            await c.fetch_entries()
        assert exc_info.value.retry_after_seconds == 30.0

    @pytest.mark.asyncio
    async def test_500_retries_then_raises(self):
        c = _make_client()
        # Size from MAX_RETRIES_5XX so the test stays in lockstep with
        # the constant if it's ever bumped.
        responses = [_resp(500)] * (MAX_RETRIES_5XX + 1)
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),
            ),
            pytest.raises(NightscoutServerError),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_500_then_200_succeeds_on_retry(self):
        c = _make_client()
        # MAX_RETRIES_5XX failures followed by a success should be
        # within budget regardless of how the constant is tuned.
        responses = [_resp(503)] * MAX_RETRIES_5XX + [_resp(200, [{"sgv": 100}])]
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),
            ),
        ):
            result = await c.fetch_entries()
        assert result == [{"sgv": 100}]

    @pytest.mark.asyncio
    async def test_429_retry_after_clamped_to_cap(self):
        """Pathological Retry-After should not pin us for hours."""
        c = _make_client()
        responses = [
            _resp(429, headers={"Retry-After": "86400"}),
            _resp(200, []),
        ]
        sleep_mock = AsyncMock()
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=sleep_mock,
            ),
        ):
            result = await c.fetch_entries()
        assert result == []
        # First (and only) sleep should be the clamped cap, not 86400.
        sleep_mock.assert_awaited_once()
        assert sleep_mock.await_args.args[0] == RETRY_AFTER_CAP_SECONDS


# ---------------------------------------------------------------------------
# Pagination params
# ---------------------------------------------------------------------------


class TestFetchEntries:
    @pytest.mark.asyncio
    async def test_fetch_entries_default_params(self):
        c = _make_client()
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries()
        call = mock_request.call_args
        assert call.args[0] == "GET"
        assert call.args[1] == "/api/v1/entries.json"
        assert call.kwargs["params"] == {
            "count": DEFAULT_PAGE_SIZE,
            "sort[_id]": "desc",
        }

    @pytest.mark.asyncio
    async def test_fetch_entries_with_since_and_count(self):
        c = _make_client()
        since = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries(since=since, count=100)
        params = mock_request.call_args.kwargs["params"]
        assert params["count"] == 100
        assert params["find[date][$gte]"] == 1777636800000

    @pytest.mark.asyncio
    async def test_fetch_entries_accepts_aaps_row_without_datestring(self):
        c = _make_client()
        row = {
            "_id": "6a001f288e31759edc8c0d25",
            "date": 1777636800000,
            "sgv": 120,
        }
        mock_request = AsyncMock(return_value=_resp(200, [row]))
        with patch.object(c._client, "request", new=mock_request):
            result = await c.fetch_entries(
                since=datetime(2026, 5, 1, 12, 0, tzinfo=UTC), count=2
            )
        assert result == [row]
        params = mock_request.call_args.kwargs["params"]
        assert params["find[date][$gte]"] == 1777636800000
        assert "find[dateString][$gte]" not in params

    @pytest.mark.asyncio
    @pytest.mark.parametrize("body", [{"unexpected": True}, b"not-json"])
    async def test_fetch_entries_rejects_invalid_collection_payload(self, body):
        c = _make_client()
        with (
            patch.object(
                c._client,
                "request",
                new=AsyncMock(return_value=_resp(200, body)),
            ),
            pytest.raises(
                NightscoutServerError,
                match="invalid collection payload",
            ),
        ):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_fetch_treatments_uses_created_at_field(self):
        c = _make_client()
        since = datetime(2026, 5, 1, tzinfo=UTC)
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_treatments(since=since, count=200)
        params = mock_request.call_args.kwargs["params"]
        assert params["find[created_at][$gte]"] == "2026-05-01T00:00:00Z"

    @pytest.mark.asyncio
    async def test_fetch_devicestatus_uses_created_at_field(self):
        c = _make_client()
        since = datetime(2026, 5, 1, tzinfo=UTC)
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_devicestatus(since=since)
        params = mock_request.call_args.kwargs["params"]
        assert "find[created_at][$gte]" in params

    @pytest.mark.asyncio
    async def test_fetch_entries_naive_datetime_raises_value_error(self):
        """Naive datetimes are rejected. The previous "treat as UTC"
        behavior silently corrupted wall-clock data when callers ran
        outside UTC. Force the caller to be explicit."""
        c = _make_client()
        naive = datetime(2026, 5, 1, 12, 0, 0)  # no tzinfo
        with (
            patch.object(
                c._client, "request", new=AsyncMock(return_value=_resp(200, []))
            ),
            pytest.raises(ValueError, match="timezone-aware"),
        ):
            await c.fetch_entries(since=naive)


class TestFetchEntriesByObjectId:
    """Issue #598: entries cursor swaps to NS Mongo `_id` to avoid
    missing entries that uploaders backfilled into NS with old
    `dateString` values (Dexcom Share -> NS bridge being the canonical
    offender)."""

    @pytest.mark.asyncio
    async def test_uses_find_id_gt_when_object_id_provided(self):
        c = _make_client()
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries(since_object_id="6a001f288e31759edc8c0d25")
        params = mock_request.call_args.kwargs["params"]
        assert params["find[_id][$gt]"] == "6a001f288e31759edc8c0d25"
        # Date filter is NOT sent when ObjectId cursor is in play
        # -- it would over-constrain and silently drop late-uploaded
        # entries from a window that's now in the past.
        assert "find[date][$gte]" not in params

    @pytest.mark.asyncio
    async def test_object_id_takes_precedence_over_since(self):
        """When both cursors are passed, ObjectId wins. Sync wires
        both during the first cycle after migration 054; we must NOT
        AND them together (would re-introduce the backfill miss)."""
        c = _make_client()
        since = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries(
                since=since,
                since_object_id="6a001f288e31759edc8c0d25",
            )
        params = mock_request.call_args.kwargs["params"]
        assert "find[_id][$gt]" in params
        assert "find[date][$gte]" not in params

    @pytest.mark.asyncio
    async def test_invalid_object_id_raises_value_error(self):
        """Bad cursor value should fail loud at the client boundary
        rather than send junk to NS. Sync code catches and retries
        the next cycle with the time-window fallback."""
        c = _make_client()
        with pytest.raises(ValueError, match="24-character hex ObjectId"):
            await c.fetch_entries(since_object_id="not-an-object-id")

    @pytest.mark.asyncio
    async def test_falls_back_to_epoch_date_when_no_object_id(self):
        """First sync after migration 054 has no ObjectId cursor yet.
        Client falls back to the uploader-independent date filter so we still
        get a bounded window."""
        c = _make_client()
        since = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
        mock_request = AsyncMock(return_value=_resp(200, []))
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries(since=since)
        params = mock_request.call_args.kwargs["params"]
        assert params["find[date][$gte]"] == 1777636800000
        assert "find[_id][$gt]" not in params


class TestCollectionPaging:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("method_name", "path", "since_field"),
        [
            ("fetch_treatments", "/api/v1/treatments.json", "created_at"),
            ("fetch_devicestatus", "/api/v1/devicestatus.json", "created_at"),
        ],
    )
    async def test_pages_created_at_collection_oldest_first(
        self, method_name, path, since_field
    ):
        c = _make_client()
        pages = [
            _resp(
                200,
                [
                    {
                        "_id": "6a001f278e31759edc8c0d24",
                        since_field: "2026-05-02T00:00:00Z",
                    },
                    {
                        "_id": "6a001f288e31759edc8c0d25",
                        since_field: "2026-05-03T00:00:00Z",
                    },
                ],
            ),
            _resp(
                200,
                [
                    {
                        "_id": "6a001f268e31759edc8c0d23",
                        since_field: "2026-05-04T12:00:00Z",
                    }
                ],
            ),
        ]
        mock_request = AsyncMock(side_effect=pages)
        with patch.object(c._client, "request", new=mock_request):
            result = await getattr(c, method_name)(
                since=datetime(2026, 5, 1, tzinfo=UTC),
                count=2,
                oldest_first=True,
            )

        assert isinstance(result, PagedRecords)
        assert result.pages_fetched == 2
        assert result.truncated is False
        assert len(result) == 3
        assert mock_request.call_args_list[0].args[1] == path
        first_params = mock_request.call_args_list[0].kwargs["params"]
        second_params = mock_request.call_args_list[1].kwargs["params"]
        assert f"find[{since_field}][$gte]" in first_params
        assert "find[_id][$lt]" not in first_params
        assert first_params[f"sort[{since_field}]"] == "asc"
        assert second_params[f"find[{since_field}][$gte]"] == "2026-05-03T00:00:00Z"

    @pytest.mark.asyncio
    async def test_object_id_lower_bound_is_kept_across_pages(self):
        c = _make_client()
        mock_request = AsyncMock(
            side_effect=[
                _resp(
                    200,
                    [
                        {"_id": "6a001f288e31759edc8c0d25", "date": 20},
                        {"_id": "6a001f278e31759edc8c0d24", "date": 10},
                    ],
                ),
                _resp(200, []),
            ]
        )
        lower = "6a001f208e31759edc8c0d20"
        with patch.object(c._client, "request", new=mock_request):
            await c.fetch_entries(since_object_id=lower, count=2, oldest_first=True)
        params = mock_request.call_args_list[1].kwargs["params"]
        assert params["find[_id][$gt]"] == "6a001f288e31759edc8c0d25"
        assert params["sort[_id]"] == "asc"

    @pytest.mark.asyncio
    async def test_page_limit_marks_result_truncated(self):
        c = _make_client()
        pages = [
            _resp(
                200,
                [
                    {
                        "_id": f"{page + 1:08x}{row + 1:016x}",
                        "created_at": f"2026-05-0{page + 1}T00:0{row}:00Z",
                    }
                    for row in range(2)
                ],
            )
            for page in range(MAX_PAGES_PER_COLLECTION)
        ]
        mock_request = AsyncMock(side_effect=pages)
        with patch.object(c._client, "request", new=mock_request):
            result = await c.fetch_treatments(count=2, oldest_first=True)
        assert result.truncated is True
        assert result.pages_fetched == MAX_PAGES_PER_COLLECTION
        assert result.safe_since == datetime(2026, 5, 3, 0, 1, tzinfo=UTC)
        assert mock_request.await_count == MAX_PAGES_PER_COLLECTION

    @pytest.mark.asyncio
    async def test_equal_timestamps_page_by_unique_object_id(self):
        c = _make_client()
        mock_request = AsyncMock(
            side_effect=[
                _resp(
                    200,
                    [
                        {
                            "_id": "6a001f288e31759edc8c0d25",
                            "date": 1778414400000,
                        },
                        {
                            "_id": "6a001f278e31759edc8c0d24",
                            "date": 1778414400000,
                        },
                    ],
                ),
                _resp(200, []),
            ]
        )
        with patch.object(
            c._client,
            "request",
            new=mock_request,
        ):
            result = await c.fetch_entries(count=2, oldest_first=True)
        assert result.truncated is False
        assert result.pages_fetched == 2
        assert (
            mock_request.call_args_list[1].kwargs["params"]["find[date][$gte]"]
            == 1778414400000
        )

    @pytest.mark.asyncio
    async def test_stringified_epoch_timestamp_can_resume(self):
        c = _make_client()
        mock_request = AsyncMock(
            side_effect=[
                _resp(
                    200,
                    [
                        {"_id": "6a001f278e31759edc8c0d24", "date": "1778414300000"},
                        {"_id": "6a001f288e31759edc8c0d25", "date": "1778414400000"},
                    ],
                ),
                _resp(200, []),
            ]
        )
        with patch.object(c._client, "request", new=mock_request):
            result = await c.fetch_entries(count=2, oldest_first=True)

        assert result.truncated is False
        assert (
            mock_request.call_args_list[1].kwargs["params"]["find[date][$gte]"]
            == 1778414400000
        )

    @pytest.mark.asyncio
    async def test_inclusive_timestamp_boundary_deduplicates_overlap(self):
        c = _make_client()
        boundary_row = {"_id": "6a001f278e31759edc8c0d24", "date": 20}
        mock_request = AsyncMock(
            side_effect=[
                _resp(
                    200,
                    [
                        {"_id": "6a001f268e31759edc8c0d23", "date": 10},
                        boundary_row,
                    ],
                ),
                _resp(
                    200,
                    [
                        boundary_row,
                        {"_id": "6a001f288e31759edc8c0d25", "date": 30},
                    ],
                ),
                _resp(200, []),
            ]
        )
        with patch.object(c._client, "request", new=mock_request):
            result = await c.fetch_entries(count=2, oldest_first=True)

        assert [row["_id"] for row in result] == [
            "6a001f268e31759edc8c0d23",
            "6a001f278e31759edc8c0d24",
            "6a001f288e31759edc8c0d25",
        ]
        assert result.truncated is False

    @pytest.mark.asyncio
    async def test_out_of_order_page_uses_highest_timestamp_boundary(self):
        c = _make_client()
        mock_request = AsyncMock(
            side_effect=[
                _resp(
                    200,
                    [
                        {
                            "_id": "6a001f288e31759edc8c0d25",
                            "date": 1778414400000,
                        },
                        {
                            "_id": "6a001f278e31759edc8c0d24",
                            "date": 1778414300000,
                        },
                    ],
                ),
                _resp(
                    200,
                    [
                        {
                            "_id": "6a001f298e31759edc8c0d26",
                            "date": 1778414500000,
                        }
                    ],
                ),
            ]
        )
        with patch.object(c._client, "request", new=mock_request):
            result = await c.fetch_entries(count=2, oldest_first=True)

        assert [row["_id"] for row in result] == [
            "6a001f288e31759edc8c0d25",
            "6a001f278e31759edc8c0d24",
            "6a001f298e31759edc8c0d26",
        ]
        assert (
            mock_request.call_args_list[1].kwargs["params"]["find[date][$gte]"]
            == 1778414400000
        )

    @pytest.mark.asyncio
    async def test_full_page_without_any_cursor_field_is_truncated(self):
        c = _make_client()
        with patch.object(
            c._client,
            "request",
            new=AsyncMock(return_value=_resp(200, [{"sgv": 1}, {"sgv": 2}])),
        ):
            result = await c.fetch_entries(count=2, oldest_first=True)
        assert result.truncated is True
        assert result.pages_fetched == 1


# ---------------------------------------------------------------------------
# fetch_profile
# ---------------------------------------------------------------------------


class TestFetchProfile:
    @pytest.mark.asyncio
    async def test_fetch_profile_returns_list(self):
        c = _make_client()
        with patch.object(
            c._client,
            "request",
            new=AsyncMock(return_value=_resp(200, [{"defaultProfile": "Default"}])),
        ):
            profiles = await c.fetch_profile()
        assert profiles == [{"defaultProfile": "Default"}]

    @pytest.mark.asyncio
    async def test_fetch_profile_handles_non_list_body(self):
        c = _make_client()
        with patch.object(
            c._client,
            "request",
            new=AsyncMock(return_value=_resp(200, {"unexpected": True})),
        ):
            profiles = await c.fetch_profile()
        # Defensive: shouldn't crash on unexpected shapes.
        assert profiles == []


# ---------------------------------------------------------------------------
# test_connection / auto-detect
# ---------------------------------------------------------------------------


class TestConnectionTest:
    @pytest.mark.asyncio
    async def test_v1_only_path_used_for_explicit_v1(self):
        c = _make_client(api_version=NightscoutApiVersion.V1)
        mock_request = AsyncMock(return_value=_resp(200, {"version": "15.0.8"}))
        with patch.object(c._client, "request", new=mock_request):
            outcome = await c.test_connection()
        assert outcome.ok is True
        assert outcome.api_version_detected == NightscoutApiVersion.V1
        assert outcome.server_version == "15.0.8"
        assert mock_request.call_count == 1
        assert mock_request.call_args.args[1] == "/api/v1/status.json"

    @pytest.mark.asyncio
    async def test_v3_only_path_used_for_explicit_v3(self):
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN, api_version=NightscoutApiVersion.V3
        )
        # Real Nightscout v3 /api/v3/version response shape (verified
        # against cgm-remote-monitor 15.0.8) -- no `result` envelope.
        responses = [
            _resp(
                200,
                {"status": 200, "version": "15.0.8", "apiVersion": "3.0.5"},
            ),  # /api/v3/version
            _resp(200, {}),  # /api/v3/status with auth
        ]
        with patch.object(c._client, "request", new=AsyncMock(side_effect=responses)):
            outcome = await c.test_connection()
        assert outcome.ok is True
        assert outcome.api_version_detected == NightscoutApiVersion.V3
        assert outcome.server_version == "15.0.8"

    @pytest.mark.asyncio
    async def test_auto_with_secret_uses_v1_only(self):
        c = _make_client(
            auth_type=NightscoutAuthType.SECRET, api_version=NightscoutApiVersion.AUTO
        )
        mock_request = AsyncMock(return_value=_resp(200, {"version": "15.0.8"}))
        with patch.object(c._client, "request", new=mock_request):
            outcome = await c.test_connection()
        assert outcome.api_version_detected == NightscoutApiVersion.V1
        # Only one call (no v3 fallback attempted).
        assert mock_request.call_count == 1

    @pytest.mark.asyncio
    async def test_auto_with_token_uses_v3_only(self):
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN, api_version=NightscoutApiVersion.AUTO
        )
        responses = [
            _resp(200, {"status": 200, "version": "15.0.8", "apiVersion": "3.0.5"}),
            _resp(200, {}),
        ]
        with patch.object(c._client, "request", new=AsyncMock(side_effect=responses)):
            outcome = await c.test_connection()
        assert outcome.api_version_detected == NightscoutApiVersion.V3

    @pytest.mark.asyncio
    async def test_pure_auto_falls_back_to_v3_on_v1_404(self):
        """auto/auto -- v1 status 404, v3 path succeeds."""
        c = _make_client(
            auth_type=NightscoutAuthType.AUTO, api_version=NightscoutApiVersion.AUTO
        )
        responses = [
            _resp(404),  # /api/v1/status.json -- server doesn't speak v1
            _resp(200, {"status": 200, "version": "15.0.8", "apiVersion": "3.0.5"}),
            _resp(200, {}),  # /v3/status with auth
        ]
        with patch.object(c._client, "request", new=AsyncMock(side_effect=responses)):
            outcome = await c.test_connection()
        assert outcome.ok is True
        assert outcome.api_version_detected == NightscoutApiVersion.V3

    @pytest.mark.asyncio
    async def test_pure_auto_falls_back_to_v3_on_v1_auth_failure(self):
        """auto/auto: if v1 401s, the credential might actually be a
        v3 token (the user said they didn't know which type it was).
        Fall back and try v3."""
        c = _make_client(
            auth_type=NightscoutAuthType.AUTO,
            api_version=NightscoutApiVersion.AUTO,
            credential="v3-bearer-token-not-a-secret",
        )
        responses = [
            _resp(401),  # v1 rejected
            _resp(200, {"status": 200, "version": "15.0.8", "apiVersion": "3.0.5"}),
            _resp(200, {}),  # v3 status accepts the token
        ]
        with patch.object(c._client, "request", new=AsyncMock(side_effect=responses)):
            outcome = await c.test_connection()
        assert outcome.ok is True
        assert outcome.api_version_detected == NightscoutApiVersion.V3

    @pytest.mark.asyncio
    async def test_explicit_secret_does_not_fall_back_on_v1_auth_failure(self):
        """If user explicitly said `auth_type=secret`, a 401 is a real
        auth failure -- don't second-guess by trying v3."""
        c = _make_client(
            auth_type=NightscoutAuthType.SECRET, api_version=NightscoutApiVersion.AUTO
        )
        mock_request = AsyncMock(return_value=_resp(401))
        with patch.object(c._client, "request", new=mock_request):
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert outcome.auth_validated is False
        assert mock_request.call_count == 1

    @pytest.mark.asyncio
    async def test_v1_auth_failure_returns_failure_outcome_not_exception(self):
        c = _make_client(api_version=NightscoutApiVersion.V1)
        with patch.object(c._client, "request", new=AsyncMock(return_value=_resp(401))):
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert outcome.auth_validated is False
        assert outcome.api_version_detected == NightscoutApiVersion.V1
        assert "Authentication rejected" in (outcome.error or "")

    @pytest.mark.asyncio
    async def test_network_error_during_test_returns_failure_outcome(self):
        c = _make_client(api_version=NightscoutApiVersion.V1)
        with patch.object(
            c._client,
            "request",
            new=AsyncMock(side_effect=httpx.ConnectError("conn refused")),
        ):
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert "network" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_v3_server_error_returns_failure_outcome(self):
        """5xx burst on /api/v3/version (after retry exhaustion)
        must surface as an outcome, not propagate as an exception.
        `_test_v3` doesn't catch it locally -- the outer handler in
        `test_connection` is what saves us."""
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN, api_version=NightscoutApiVersion.V3
        )
        responses = [_resp(500)] * (MAX_RETRIES_5XX + 1)
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),
            ),
        ):
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert "server error" in (outcome.error or "").lower()

    @pytest.mark.asyncio
    async def test_v3_rate_limit_returns_failure_outcome(self):
        """429 storm on v3 probes (after retry exhaustion) must surface
        as an outcome, not propagate as an exception."""
        c = _make_client(
            auth_type=NightscoutAuthType.TOKEN, api_version=NightscoutApiVersion.V3
        )
        responses = [_resp(429, headers={"Retry-After": "1"})] * (MAX_RETRIES_429 + 1)
        with (
            patch.object(c._client, "request", new=AsyncMock(side_effect=responses)),
            patch(
                "src.services.integrations.nightscout.client.asyncio.sleep",
                new=AsyncMock(),
            ),
        ):
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert "rate limited" in (outcome.error or "").lower()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_backoff_delay_grows_with_attempts(self):
        d0 = _backoff_delay(0)
        d2 = _backoff_delay(2)
        # With jitter we can't assert exact values, but the upper
        # bounds are clearly increasing.
        assert d0 <= 2.0
        assert d2 <= 8.0
        assert d2 > d0  # almost always true with jitter; if flaky, drop

    def test_parse_retry_after_seconds(self):
        assert _parse_retry_after("30") == 30.0
        assert _parse_retry_after("0") == 0.0
        assert _parse_retry_after("") is None
        assert _parse_retry_after(None) is None
        assert _parse_retry_after("not-a-number") is None

    def test_parse_retry_after_rejects_negatives(self):
        """Negative values are nonsensical; treat as missing."""
        assert _parse_retry_after("-1") is None
        assert _parse_retry_after("-30.5") is None


# ---------------------------------------------------------------------------
# v3 fetch guard
# ---------------------------------------------------------------------------


class TestV3FetchGuard:
    """v3 data fetches aren't implemented yet -- raise loudly rather
    than silently sending v1 paths with a Bearer token."""

    @pytest.mark.asyncio
    async def test_fetch_entries_with_v3_raises(self):
        c = _make_client(
            api_version=NightscoutApiVersion.V3, auth_type=NightscoutAuthType.TOKEN
        )
        with pytest.raises(NotImplementedError, match="v3"):
            await c.fetch_entries()

    @pytest.mark.asyncio
    async def test_fetch_treatments_with_v3_raises(self):
        c = _make_client(
            api_version=NightscoutApiVersion.V3, auth_type=NightscoutAuthType.TOKEN
        )
        with pytest.raises(NotImplementedError):
            await c.fetch_treatments()

    @pytest.mark.asyncio
    async def test_fetch_devicestatus_with_v3_raises(self):
        c = _make_client(
            api_version=NightscoutApiVersion.V3, auth_type=NightscoutAuthType.TOKEN
        )
        with pytest.raises(NotImplementedError):
            await c.fetch_devicestatus()

    @pytest.mark.asyncio
    async def test_fetch_profile_with_v3_raises(self):
        c = _make_client(
            api_version=NightscoutApiVersion.V3, auth_type=NightscoutAuthType.TOKEN
        )
        with pytest.raises(NotImplementedError):
            await c.fetch_profile()


# ---------------------------------------------------------------------------
# Integration tests (live local Nightscout)
# ---------------------------------------------------------------------------
#
# Run by pointing NIGHTSCOUT_TEST_URL at a running instance, e.g.:
#
#   NIGHTSCOUT_TEST_URL=http://127.0.0.1:1337 \
#   NIGHTSCOUT_TEST_SECRET=glycemicgpt-test-secret-min12chars \
#   uv run pytest tests/test_nightscout_client.py -m integration
#
# Skipped automatically when the env vars aren't set.

_NS_URL = os.environ.get("NIGHTSCOUT_TEST_URL")
_NS_SECRET = os.environ.get(
    "NIGHTSCOUT_TEST_SECRET", "glycemicgpt-test-secret-min12chars"
)
_skip_no_live = pytest.mark.skipif(
    not _NS_URL,
    reason="set NIGHTSCOUT_TEST_URL to run integration tests against a real instance",
)


@_skip_no_live
@pytest.mark.integration
class TestLiveIntegration:
    @pytest.mark.asyncio
    async def test_v1_test_connection_against_live(self):
        async with await NightscoutClient.create(
            base_url=_NS_URL,
            auth_type=NightscoutAuthType.SECRET,
            credential=_NS_SECRET,
            api_version=NightscoutApiVersion.V1,
        ) as c:
            outcome = await c.test_connection()
        assert outcome.ok is True
        assert outcome.api_version_detected == NightscoutApiVersion.V1
        assert outcome.server_version  # any non-empty version string

    @pytest.mark.asyncio
    async def test_v1_fetch_entries_returns_recent_data(self):
        async with await NightscoutClient.create(
            base_url=_NS_URL,
            auth_type=NightscoutAuthType.SECRET,
            credential=_NS_SECRET,
            api_version=NightscoutApiVersion.V1,
        ) as c:
            entries = await c.fetch_entries(count=10)
        # The seed script populates ~2000 entries; expect at least some
        # if the seeder ran. If the instance is empty this returns [].
        assert isinstance(entries, list)
        if entries:
            first = entries[0]
            assert "sgv" in first or "type" in first

    @pytest.mark.asyncio
    async def test_v1_fetch_entries_with_since_filter(self):
        async with await NightscoutClient.create(
            base_url=_NS_URL,
            auth_type=NightscoutAuthType.SECRET,
            credential=_NS_SECRET,
            api_version=NightscoutApiVersion.V1,
        ) as c:
            since = datetime.now(UTC) - timedelta(days=1)
            entries = await c.fetch_entries(since=since, count=500)
        assert isinstance(entries, list)
        # If we have entries, they should all be newer than `since`.
        for e in entries:
            ds = e.get("dateString") or e.get("date")
            assert ds is not None

    @pytest.mark.asyncio
    async def test_v1_auth_rejected_with_wrong_secret(self):
        async with await NightscoutClient.create(
            base_url=_NS_URL,
            auth_type=NightscoutAuthType.SECRET,
            credential="wrong-secret-min12chars-but-bad",
            api_version=NightscoutApiVersion.V1,
        ) as c:
            outcome = await c.test_connection()
        assert outcome.ok is False
        assert outcome.auth_validated is False

    @pytest.mark.asyncio
    async def test_v1_fetch_profile(self):
        async with await NightscoutClient.create(
            base_url=_NS_URL,
            auth_type=NightscoutAuthType.SECRET,
            credential=_NS_SECRET,
            api_version=NightscoutApiVersion.V1,
        ) as c:
            profiles = await c.fetch_profile()
        assert isinstance(profiles, list)
