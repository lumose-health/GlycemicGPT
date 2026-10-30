"""Story 5.1 / 14.2: AI provider key validation service.

Validates API keys by making minimal test requests to each provider.
Supports direct API keys, subscription proxies, and self-hosted endpoints.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import anthropic
import httpx
import openai

from src.logging_config import get_logger
from src.models.ai_provider import AIProviderType
from src.schemas.ai_provider import _is_private_ip

logger = get_logger(__name__)

# Validation constants
CLAUDE_VALIDATION_MODEL = "claude-haiku-4-5-20251001"
CLAUDE_VALIDATION_MAX_TOKENS = 1
VALIDATION_TIMEOUT_SECONDS = 15
# Local/self-hosted servers (e.g. Ollama) may need to load or swap a model
# before answering the first request, which can take a minute or more. Kept
# below the web proxy's 120s timeout (apps/web next.config.ts proxyTimeout) so
# the user sees this API's timeout message rather than a proxy error.
LOCAL_VALIDATION_TIMEOUT_SECONDS = 90
# Only the wait for a response gets the long timeout. A host that is off or
# silently dropping packets should still fail fast as a connection error.
VALIDATION_CONNECT_TIMEOUT_SECONDS = 10
# Validation makes a single attempt; SDK retries would multiply the wait.
VALIDATION_MAX_RETRIES = 0

# Hostnames treated as local without a DNS lookup
_LOCAL_HOSTNAMES = {
    "localhost",
    "host.docker.internal",
    "gateway.docker.internal",
}
_LOCAL_HOSTNAME_SUFFIXES = (".local", ".localhost")
# Carrier-grade NAT range used by Tailscale tailnets; not ``is_private`` in Python
_CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")

# Key masking constants
MASK_SUFFIX_LENGTH = 4
MASK_MIN_LENGTH = 5
MASK_PREFIX = "sk-"

# Standardised error message templates
_AUTH_ERROR_TEMPLATE = (
    "Invalid {provider} API key. Please check your key and try again."
)
_CONNECTION_ERROR_TEMPLATE = (
    "Unable to connect to {provider} API. Please try again later."
)
_UNEXPECTED_ERROR_MSG = (
    "An error occurred while validating the API key. Please try again."
)
_TIMEOUT_ERROR_TEMPLATE = (
    "{provider} API did not respond within {timeout} seconds. Please try again later."
)
_ENDPOINT_TIMEOUT_ERROR_TEMPLATE = (
    "The endpoint at {base_url} did not respond within {timeout} seconds. "
    "Please try again later."
)
_LOCAL_ENDPOINT_TIMEOUT_ERROR_TEMPLATE = (
    "The endpoint at {base_url} did not respond within {timeout} seconds. "
    "A local model may still be loading, so please try again."
)

# Provider types that validate via OpenAI SDK (matches _OPENAI_SDK_TYPES in ai_client.py)
_OPENAI_SDK_TYPES = {
    AIProviderType.OPENAI_API,
    AIProviderType.CLAUDE_SUBSCRIPTION,
    AIProviderType.CHATGPT_SUBSCRIPTION,
    AIProviderType.COPILOT_SUBSCRIPTION,
    AIProviderType.OPENAI_COMPATIBLE,
    AIProviderType.OPENAI,  # Legacy
}

# Provider types that validate via Anthropic SDK (matches _ANTHROPIC_SDK_TYPES in ai_client.py)
_ANTHROPIC_SDK_TYPES = {
    AIProviderType.CLAUDE_API,
    AIProviderType.CLAUDE,  # Legacy
}

# Default models per provider type for validation (subset of ai_client.DEFAULT_MODELS)
_VALIDATION_MODELS: dict[AIProviderType, str] = {
    AIProviderType.CLAUDE_SUBSCRIPTION: "claude-sonnet-4-5-20250929",
    AIProviderType.CHATGPT_SUBSCRIPTION: "gpt-4o",
    AIProviderType.COPILOT_SUBSCRIPTION: "copilot-claude-sonnet-4.5",
    AIProviderType.OPENAI_COMPATIBLE: "gpt-4o",
    AIProviderType.OPENAI_API: "gpt-4o",
}


def _is_local_address(ip: str) -> bool:
    try:
        if ipaddress.ip_address(ip) in _CGNAT_NETWORK:
            return True
    except ValueError:
        pass
    return _is_private_ip(ip)


def _is_local_base_url(base_url: str | None) -> bool:
    """Return True if ``base_url`` points at a local or private-network host.

    Covers loopback, RFC 1918, link-local, Tailscale (CGNAT), ``.local`` mDNS
    names and the Docker host aliases. Only used to pick a validation timeout
    -- it does not decide whether a URL is allowed (see ``_validate_base_url``).
    Hostnames count as local if any resolved address is local, or if they fail
    to resolve; such requests fail fast on connect, so the longer timeout is moot.
    """
    if not base_url:
        return False
    try:
        hostname = urlparse(base_url).hostname
        if not hostname:
            return False
        hostname = hostname.lower()
        if hostname in _LOCAL_HOSTNAMES or hostname.endswith(_LOCAL_HOSTNAME_SUFFIXES):
            return True
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            try:
                resolved = socket.getaddrinfo(
                    hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM
                )
            except OSError:
                return True
            return not resolved or any(
                _is_local_address(entry[4][0]) for entry in resolved
            )
        return _is_local_address(hostname)
    except ValueError:
        # Malformed URL or hostname (UnicodeError is a ValueError)
        return False


def _validation_timeout(seconds: int) -> httpx.Timeout:
    return httpx.Timeout(seconds, connect=VALIDATION_CONNECT_TIMEOUT_SECONDS)


def _is_response_timeout(error: Exception) -> bool:
    """True if the provider accepted the connection but did not answer in time.

    Both SDKs raise APITimeoutError (a subclass of APIConnectionError) chained
    from the underlying httpx timeout; a connect timeout is a connection error.
    """
    return isinstance(
        error, (openai.APITimeoutError, anthropic.APITimeoutError)
    ) and not isinstance(error.__cause__, httpx.ConnectTimeout)


def validate_ai_api_key(
    provider_type: AIProviderType,
    api_key: str,
    base_url: str | None = None,
    model_name: str | None = None,
) -> tuple[bool, str | None]:
    """Validate an AI provider API key.

    Routes to the appropriate provider validation function.

    Args:
        provider_type: The AI provider to validate against.
        api_key: The API key to test.
        base_url: Optional base URL for proxy/self-hosted endpoints.
        model_name: Optional model name for the validation request.

    Returns:
        Tuple of (success, error_message).
    """
    if provider_type in _ANTHROPIC_SDK_TYPES:
        return validate_claude_api_key(api_key)
    elif provider_type in _OPENAI_SDK_TYPES:
        if base_url:
            # Use provider-specific default model for validation
            effective_model = model_name or _VALIDATION_MODELS.get(
                provider_type, "gpt-4o"
            )
            return validate_openai_compatible_endpoint(
                api_key, base_url, effective_model
            )
        return validate_openai_api_key(api_key)
    else:
        return False, f"Unsupported provider: {provider_type}"


def validate_claude_api_key(api_key: str) -> tuple[bool, str | None]:
    """Validate a Claude (Anthropic) API key.

    Makes a minimal API call to verify the key is valid.

    Args:
        api_key: Anthropic API key to test.

    Returns:
        Tuple of (success, error_message).
    """
    try:
        client = anthropic.Anthropic(
            api_key=api_key,
            timeout=_validation_timeout(VALIDATION_TIMEOUT_SECONDS),
            max_retries=VALIDATION_MAX_RETRIES,
        )
        client.messages.create(
            model=CLAUDE_VALIDATION_MODEL,
            max_tokens=CLAUDE_VALIDATION_MAX_TOKENS,
            messages=[{"role": "user", "content": "test"}],
        )
        return True, None
    except anthropic.AuthenticationError:
        logger.warning("Claude API key validation failed - invalid key")
        return False, _AUTH_ERROR_TEMPLATE.format(provider="Claude")
    except anthropic.RateLimitError:
        # Key is valid but rate limited -- still means auth succeeded
        logger.info("Claude API key validated (rate limited but authenticated)")
        return True, None
    except anthropic.APIConnectionError as e:
        if _is_response_timeout(e):
            logger.warning(
                "Claude API key validation failed - timed out",
                timeout=VALIDATION_TIMEOUT_SECONDS,
            )
            return False, _TIMEOUT_ERROR_TEMPLATE.format(
                provider="Claude", timeout=VALIDATION_TIMEOUT_SECONDS
            )
        logger.warning(
            "Claude API key validation failed - connection error",
            error=str(e),
        )
        return False, _CONNECTION_ERROR_TEMPLATE.format(provider="Claude")
    except Exception as e:
        logger.error(
            "Claude API key validation failed - unexpected error",
            error=str(e),
        )
        return False, _UNEXPECTED_ERROR_MSG


def validate_openai_api_key(api_key: str) -> tuple[bool, str | None]:
    """Validate an OpenAI API key.

    Lists models to verify the key is valid.

    Args:
        api_key: OpenAI API key to test.

    Returns:
        Tuple of (success, error_message).
    """
    try:
        client = openai.OpenAI(
            api_key=api_key,
            timeout=_validation_timeout(VALIDATION_TIMEOUT_SECONDS),
            max_retries=VALIDATION_MAX_RETRIES,
        )
        client.models.list()
        return True, None
    except openai.AuthenticationError:
        logger.warning("OpenAI API key validation failed - invalid key")
        return False, _AUTH_ERROR_TEMPLATE.format(provider="OpenAI")
    except openai.RateLimitError:
        # Key is valid but rate limited -- still means auth succeeded
        logger.info("OpenAI API key validated (rate limited but authenticated)")
        return True, None
    except openai.APIConnectionError as e:
        if _is_response_timeout(e):
            logger.warning(
                "OpenAI API key validation failed - timed out",
                timeout=VALIDATION_TIMEOUT_SECONDS,
            )
            return False, _TIMEOUT_ERROR_TEMPLATE.format(
                provider="OpenAI", timeout=VALIDATION_TIMEOUT_SECONDS
            )
        logger.warning(
            "OpenAI API key validation failed - connection error",
            error=str(e),
        )
        return False, _CONNECTION_ERROR_TEMPLATE.format(provider="OpenAI")
    except Exception as e:
        logger.error(
            "OpenAI API key validation failed - unexpected error",
            error=str(e),
        )
        return False, _UNEXPECTED_ERROR_MSG


def validate_openai_compatible_endpoint(
    api_key: str,
    base_url: str,
    model_name: str | None = None,
) -> tuple[bool, str | None]:
    """Validate an OpenAI-compatible endpoint (proxy or self-hosted).

    Uses chat.completions.create with max_tokens=1 instead of models.list(),
    since many proxies (claude-max-api-proxy, LiteLLM) don't support listing.

    Args:
        api_key: API key (may be "not-needed" for subscription proxies).
        base_url: The endpoint URL (e.g., http://localhost:3456/v1).
        model_name: Model to use for validation test.

    Returns:
        Tuple of (success, error_message).
    """
    is_local = _is_local_base_url(base_url)
    timeout = (
        LOCAL_VALIDATION_TIMEOUT_SECONDS if is_local else VALIDATION_TIMEOUT_SECONDS
    )
    try:
        client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=_validation_timeout(timeout),
            max_retries=VALIDATION_MAX_RETRIES,
        )
        test_model = model_name or "gpt-4o"
        client.chat.completions.create(
            model=test_model,
            max_tokens=1,
            messages=[{"role": "user", "content": "test"}],
        )
        return True, None
    except openai.AuthenticationError:
        logger.warning(
            "OpenAI-compatible endpoint validation failed - auth error",
            base_url=base_url,
        )
        return False, _AUTH_ERROR_TEMPLATE.format(provider="endpoint")
    except openai.RateLimitError:
        logger.info(
            "OpenAI-compatible endpoint validated (rate limited but reachable)",
            base_url=base_url,
        )
        return True, None
    except openai.APIConnectionError as e:
        if _is_response_timeout(e):
            logger.warning(
                "OpenAI-compatible endpoint validation failed - timed out",
                base_url=base_url,
                timeout=timeout,
            )
            template = (
                _LOCAL_ENDPOINT_TIMEOUT_ERROR_TEMPLATE
                if is_local
                else _ENDPOINT_TIMEOUT_ERROR_TEMPLATE
            )
            return False, template.format(base_url=base_url, timeout=timeout)
        logger.warning(
            "OpenAI-compatible endpoint validation failed - connection error",
            base_url=base_url,
            error=str(e),
        )
        return (
            False,
            f"Unable to connect to endpoint at {base_url}. "
            "Please check the URL and ensure the service is running.",
        )
    except Exception as e:
        logger.error(
            "OpenAI-compatible endpoint validation failed - unexpected error",
            base_url=base_url,
            error=str(e),
        )
        return False, _UNEXPECTED_ERROR_MSG


def mask_api_key(api_key: str) -> str:
    """Mask an API key showing only the last 4 characters.

    Args:
        api_key: The full API key.

    Returns:
        Masked key like ``sk-...xY7z``.
    """
    if len(api_key) < MASK_MIN_LENGTH:
        return "****"
    prefix = MASK_PREFIX if api_key.startswith(MASK_PREFIX) else ""
    suffix = api_key[-MASK_SUFFIX_LENGTH:]
    return f"{prefix}...{suffix}"
