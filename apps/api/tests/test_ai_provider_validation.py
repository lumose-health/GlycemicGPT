"""Tests for AI provider key validation timeouts and error messages (#1026)."""

import socket
import threading
from unittest.mock import MagicMock, patch

import anthropic
import httpx
import openai
import pytest

from src.models.ai_provider import AIProviderType
from src.services.ai_provider import (
    LOCAL_VALIDATION_TIMEOUT_SECONDS,
    VALIDATION_CONNECT_TIMEOUT_SECONDS,
    VALIDATION_TIMEOUT_SECONDS,
    _is_local_base_url,
    validate_ai_api_key,
    validate_claude_api_key,
    validate_openai_api_key,
    validate_openai_compatible_endpoint,
)

LOCAL = LOCAL_VALIDATION_TIMEOUT_SECONDS
CLOUD = VALIDATION_TIMEOUT_SECONDS
GETADDRINFO = "src.schemas.ai_provider.socket.getaddrinfo"


def _addrinfo(ip: str) -> list[tuple]:
    """Build a getaddrinfo() result resolving to a single address."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]


def _timeout_error(cause: Exception, sdk=openai) -> Exception:
    """Build an APITimeoutError chained from an httpx error, as the SDKs do."""
    error = sdk.APITimeoutError(request=MagicMock())
    error.__cause__ = cause
    return error


def _read_timeout(sdk=openai) -> Exception:
    return _timeout_error(httpx.ReadTimeout("timed out"), sdk)


def _connect_timeout(sdk=openai) -> Exception:
    return _timeout_error(httpx.ConnectTimeout("timed out"), sdk)


def _assert_client_timeout(mock_cls, seconds: int) -> None:
    kwargs = mock_cls.call_args.kwargs
    timeout = kwargs["timeout"]
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.read == seconds
    assert timeout.connect == VALIDATION_CONNECT_TIMEOUT_SECONDS
    assert kwargs["max_retries"] == 0


class TestValidationTimeoutSelection:
    """Local/private base URLs get the longer timeout; cloud keeps 15s."""

    def test_local_timeout_stays_below_web_proxy_timeout(self):
        # apps/web next.config.ts proxyTimeout is 120s; the API must answer first
        assert CLOUD < LOCAL < 120
        assert VALIDATION_CONNECT_TIMEOUT_SECONDS <= CLOUD

    @pytest.mark.parametrize(
        "base_url",
        [
            "http://localhost:11434/v1",
            "http://127.0.0.1:11434/v1",
            "http://[::1]:11434/v1",
            "http://10.0.0.5:8080/v1",
            "http://172.16.3.4/v1",
            "http://192.168.1.50:11434/v1",
            "http://169.254.10.10/v1",
            "http://100.101.102.103:11434/v1",
            "http://ollama.local:11434/v1",
            "http://OLLAMA.LOCAL:11434/v1",
            "http://host.docker.internal:11434/v1",
        ],
    )
    def test_local_urls_get_long_timeout(self, base_url):
        no_dns = AssertionError("no DNS lookup expected")
        with patch(GETADDRINFO, side_effect=no_dns):
            assert _is_local_base_url(base_url) is True

    def test_hostname_resolving_to_private_ip_is_local(self):
        with patch(GETADDRINFO, return_value=_addrinfo("192.168.1.20")):
            assert _is_local_base_url("http://ollama.lan:11434/v1") is True

    @pytest.mark.parametrize(
        "base_url",
        [
            "https://api.openai.com/v1",
            "https://openrouter.ai/api/v1",
        ],
    )
    def test_cloud_hostnames_keep_default_timeout(self, base_url):
        with patch(GETADDRINFO, return_value=_addrinfo("8.8.8.8")):
            assert _is_local_base_url(base_url) is False

    def test_public_ip_literal_is_not_local(self):
        assert _is_local_base_url("http://8.8.8.8/v1") is False

    @pytest.mark.parametrize(
        "base_url",
        [None, "", "not-a-url", "http://[bad", f"http://{'a' * 64}.example/v1"],
    )
    def test_missing_or_malformed_base_url_is_not_local(self, base_url):
        assert _is_local_base_url(base_url) is False


class TestOpenAICompatibleEndpointValidation:
    """validate_openai_compatible_endpoint timeout, retries and messages."""

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_local_endpoint_uses_long_timeout_without_retries(self, mock_cls):
        ok, err = validate_openai_compatible_endpoint(
            "not-needed", "http://192.168.1.50:11434/v1", "llama3"
        )

        assert (ok, err) == (True, None)
        _assert_client_timeout(mock_cls, LOCAL)

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_cloud_endpoint_uses_default_timeout_without_retries(self, mock_cls):
        with patch(GETADDRINFO, return_value=_addrinfo("8.8.8.8")):
            ok, _ = validate_openai_compatible_endpoint(
                "sk-test", "https://openrouter.ai/api/v1", "gpt-4o"
            )

        assert ok is True
        _assert_client_timeout(mock_cls, CLOUD)

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_timeout_is_reported_as_timeout(self, mock_cls):
        create = mock_cls.return_value.chat.completions.create
        create.side_effect = _read_timeout()

        ok, err = validate_openai_compatible_endpoint(
            "not-needed", "http://localhost:11434/v1", "llama3"
        )

        assert ok is False
        assert err == (
            "The endpoint at http://localhost:11434/v1 did not respond within "
            "90 seconds. A local model may still be loading, so please try again."
        )

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_cloud_endpoint_timeout_omits_local_model_hint(self, mock_cls):
        create = mock_cls.return_value.chat.completions.create
        create.side_effect = _read_timeout()

        with patch(GETADDRINFO, return_value=_addrinfo("8.8.8.8")):
            ok, err = validate_openai_compatible_endpoint(
                "sk-test", "https://openrouter.ai/api/v1", "gpt-4o"
            )

        assert ok is False
        assert err == (
            "The endpoint at https://openrouter.ai/api/v1 did not respond within "
            "15 seconds. Please try again later."
        )

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_connection_error_message_unchanged(self, mock_cls):
        create = mock_cls.return_value.chat.completions.create
        create.side_effect = openai.APIConnectionError(request=MagicMock())

        ok, err = validate_openai_compatible_endpoint(
            "not-needed", "http://localhost:11434/v1", "llama3"
        )

        assert ok is False
        assert err == (
            "Unable to connect to endpoint at http://localhost:11434/v1. "
            "Please check the URL and ensure the service is running."
        )

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_auth_error_message_unchanged(self, mock_cls):
        auth_error = openai.AuthenticationError(
            message="bad key", response=MagicMock(status_code=401), body=None
        )
        create = mock_cls.return_value.chat.completions.create
        create.side_effect = auth_error

        ok, err = validate_openai_compatible_endpoint(
            "bad", "http://localhost:11434/v1", "llama3"
        )

        assert ok is False
        assert err == ("Invalid endpoint API key. Please check your key and try again.")

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_validate_ai_api_key_routes_local_base_url(self, mock_cls):
        ok, _ = validate_ai_api_key(
            AIProviderType.OPENAI_COMPATIBLE,
            "not-needed",
            base_url="http://host.docker.internal:11434/v1",
            model_name="llama3",
        )

        assert ok is True
        _assert_client_timeout(mock_cls, LOCAL)

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_connect_timeout_is_reported_as_connection_error(self, mock_cls):
        create = mock_cls.return_value.chat.completions.create
        create.side_effect = _connect_timeout()

        ok, err = validate_openai_compatible_endpoint(
            "not-needed", "http://192.168.1.50:11434/v1", "llama3"
        )

        assert ok is False
        assert err == (
            "Unable to connect to endpoint at http://192.168.1.50:11434/v1. "
            "Please check the URL and ensure the service is running."
        )

    def test_real_unresponsive_server_is_reported_as_timeout(self):
        """End to end through the SDK: connection accepted, no response."""
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        accepted: list[socket.socket] = []
        thread = threading.Thread(
            target=lambda: accepted.append(listener.accept()[0]), daemon=True
        )
        thread.start()
        base_url = f"http://127.0.0.1:{port}/v1"
        try:
            with patch(
                "src.services.ai_provider.LOCAL_VALIDATION_TIMEOUT_SECONDS", 0.1
            ):
                ok, err = validate_openai_compatible_endpoint(
                    "not-needed", base_url, "llama3"
                )
        finally:
            thread.join(timeout=1)
            for conn in accepted:
                conn.close()
            listener.close()

        assert ok is False
        assert err == (
            f"The endpoint at {base_url} did not respond within 0.1 seconds. "
            "A local model may still be loading, so please try again."
        )


class TestCloudKeyValidation:
    """Direct Claude/OpenAI key validation keeps 15s, no retries."""

    @patch("src.services.ai_provider.anthropic.Anthropic")
    def test_claude_uses_default_timeout_without_retries(self, mock_cls):
        ok, _ = validate_claude_api_key("sk-ant-test")

        assert ok is True
        _assert_client_timeout(mock_cls, CLOUD)

    @patch("src.services.ai_provider.anthropic.Anthropic")
    def test_claude_timeout_is_reported_as_timeout(self, mock_cls):
        create = mock_cls.return_value.messages.create
        create.side_effect = _read_timeout(anthropic)

        ok, err = validate_claude_api_key("sk-ant-test")

        assert ok is False
        assert err == (
            "Claude API did not respond within 15 seconds. Please try again later."
        )

    @patch("src.services.ai_provider.anthropic.Anthropic")
    def test_claude_connection_error_message_unchanged(self, mock_cls):
        create = mock_cls.return_value.messages.create
        create.side_effect = anthropic.APIConnectionError(request=MagicMock())

        ok, err = validate_claude_api_key("sk-ant-test")

        assert ok is False
        assert err == "Unable to connect to Claude API. Please try again later."

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_openai_uses_default_timeout_without_retries(self, mock_cls):
        ok, _ = validate_openai_api_key("sk-test")

        assert ok is True
        _assert_client_timeout(mock_cls, CLOUD)

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_openai_timeout_is_reported_as_timeout(self, mock_cls):
        list_models = mock_cls.return_value.models.list
        list_models.side_effect = _read_timeout()

        ok, err = validate_openai_api_key("sk-test")

        assert ok is False
        assert err == (
            "OpenAI API did not respond within 15 seconds. Please try again later."
        )

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_openai_connection_error_message_unchanged(self, mock_cls):
        list_models = mock_cls.return_value.models.list
        list_models.side_effect = openai.APIConnectionError(request=MagicMock())

        ok, err = validate_openai_api_key("sk-test")

        assert ok is False
        assert err == "Unable to connect to OpenAI API. Please try again later."

    @patch("src.services.ai_provider.anthropic.Anthropic")
    def test_claude_connect_timeout_is_reported_as_connection_error(self, mock_cls):
        create = mock_cls.return_value.messages.create
        create.side_effect = _connect_timeout(anthropic)

        ok, err = validate_claude_api_key("sk-ant-test")

        assert ok is False
        assert err == "Unable to connect to Claude API. Please try again later."

    @patch("src.services.ai_provider.openai.OpenAI")
    def test_openai_connect_timeout_is_reported_as_connection_error(self, mock_cls):
        list_models = mock_cls.return_value.models.list
        list_models.side_effect = _connect_timeout()

        ok, err = validate_openai_api_key("sk-test")

        assert ok is False
        assert err == "Unable to connect to OpenAI API. Please try again later."
