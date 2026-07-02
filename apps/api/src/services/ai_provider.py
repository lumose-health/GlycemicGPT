"""Story 5.1 / 14.2: AI provider key validation service.

Validates API keys by making minimal test requests to each provider.
Supports direct API keys, subscription proxies, and self-hosted endpoints.
"""

import anthropic
import openai

from src.logging_config import get_logger
from src.models.ai_provider import AIProviderType

logger = get_logger(__name__)

# Validation constants
CLAUDE_VALIDATION_MODEL = "claude-haiku-4-5-20251001"
CLAUDE_VALIDATION_MAX_TOKENS = 1
VALIDATION_TIMEOUT_SECONDS = 15

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
            api_key=api_key, timeout=VALIDATION_TIMEOUT_SECONDS
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
        client = openai.OpenAI(api_key=api_key, timeout=VALIDATION_TIMEOUT_SECONDS)
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
    try:
        client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=VALIDATION_TIMEOUT_SECONDS,
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
