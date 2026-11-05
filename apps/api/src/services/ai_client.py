"""Story 5.2 / 14.2 / 15.4: BYOAI abstraction layer.

Abstract base class and factory for AI provider clients.
Provides a unified interface for generating AI responses
regardless of the underlying provider (Claude, OpenAI, subscription proxy,
or self-hosted OpenAI-compatible endpoint).

Story 15.4: Subscription types auto-route through managed sidecar.
"""

import abc
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.encryption import decrypt_credential
from src.logging_config import get_logger
from src.models.ai_provider import AIProviderConfig, AIProviderType
from src.models.user import User
from src.schemas.ai_response import AIMessage, AIResponse

logger = get_logger(__name__)

# Default models when user has not specified a model_name override
DEFAULT_MODELS: dict[AIProviderType, str] = {
    AIProviderType.CLAUDE_API: "claude-sonnet-4-5-20250929",
    AIProviderType.OPENAI_API: "gpt-4o",
    AIProviderType.CLAUDE_SUBSCRIPTION: "claude-sonnet-4-5-20250929",
    AIProviderType.CHATGPT_SUBSCRIPTION: "gpt-4o",
    AIProviderType.COPILOT_SUBSCRIPTION: "copilot-claude-sonnet-4.5",
    AIProviderType.OPENAI_COMPATIBLE: "",  # Must be specified by user
    # Legacy values
    AIProviderType.CLAUDE: "claude-sonnet-4-5-20250929",
    AIProviderType.OPENAI: "gpt-4o",
}

# Provider types that use the OpenAI SDK (with optional base_url)
_OPENAI_SDK_TYPES = {
    AIProviderType.OPENAI_API,
    AIProviderType.CLAUDE_SUBSCRIPTION,
    AIProviderType.CHATGPT_SUBSCRIPTION,
    AIProviderType.COPILOT_SUBSCRIPTION,
    AIProviderType.OPENAI_COMPATIBLE,
    AIProviderType.OPENAI,  # Legacy
}

# Provider types that use the Anthropic SDK
_ANTHROPIC_SDK_TYPES = {
    AIProviderType.CLAUDE_API,
    AIProviderType.CLAUDE,  # Legacy
}

# Subscription types that route through the managed sidecar
_SUBSCRIPTION_TYPES = {
    AIProviderType.CLAUDE_SUBSCRIPTION,
    AIProviderType.CHATGPT_SUBSCRIPTION,
    AIProviderType.COPILOT_SUBSCRIPTION,
}


class BaseAIClient(abc.ABC):
    """Abstract base class for AI provider clients.

    Subclasses implement provider-specific API calls while
    returning a normalized AIResponse.
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str | None = None,
        provider_type: AIProviderType | None = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._base_url = base_url
        self._provider_type = provider_type

    @abc.abstractmethod
    async def generate(
        self,
        messages: list[AIMessage],
        system_prompt: str | None = None,
        max_tokens: int = 1024,
    ) -> AIResponse:
        """Generate an AI response.

        Args:
            messages: List of conversation messages.
            system_prompt: Optional system-level instruction.
            max_tokens: Maximum tokens in the response.

        Returns:
            Normalized AIResponse with content, model, provider, and usage.
        """


async def get_user_max_response_tokens(
    user: User,
    db: AsyncSession,
) -> int | None:
    """Return the user's per-response token budget override, or None.

    NULL = the caller should use its per-context default. This lookup
    is intentionally cheap (single indexed query on a row the chat
    paths already touch elsewhere); callers may also pre-load the
    AIProviderConfig themselves and read `config.max_response_tokens`
    directly to save a query.

    See issue #554 for why this is configurable: thinking models like
    Qwen3 / DeepSeek-R1 spend tokens on internal `<think>` reasoning
    that counts against the same budget as the visible response.
    """
    result = await db.execute(
        select(AIProviderConfig.max_response_tokens).where(
            AIProviderConfig.user_id == user.id
        )
    )
    return result.scalar_one_or_none()


def resolve_max_response_tokens(
    override: int | None,
    default: int,
) -> int:
    """Pick the effective per-response token budget for one call.

    `override` is the user's `max_response_tokens` setting (loaded via
    `get_user_max_response_tokens`); `default` is the context's
    historical default (1200 for web, 800 for Telegram). NULL override
    preserves prior behavior exactly.
    """
    return override if override is not None else default


async def resolve_user_max_response_tokens(
    db: AsyncSession,
    user: User,
    default_max_tokens: int,
) -> int:
    """Resolve the effective per-response token budget for one call,
    falling back to the context default if the DB lookup fails.

    Prior to issue #554 the chat paths never queried for a per-user
    override -- they used a constant. We now read
    `ai_provider_configs.max_response_tokens`; if that read raises
    (transient DB error, session hiccup, etc.), we degrade gracefully
    to the historical default rather than failing the request.
    """
    try:
        override = await get_user_max_response_tokens(user, db)
        return resolve_max_response_tokens(override, default_max_tokens)
    except Exception:
        logger.warning(
            "Failed to resolve max_response_tokens override; using default",
            user_id=str(user.id),
            default_max_tokens=default_max_tokens,
            exc_info=True,
        )
        return default_max_tokens


# Default per-response budget for the daily brief and the meal / correction
# analyses -- the `generate` default they used before issue #1020.
ANALYSIS_MAX_RESPONSE_TOKENS = 1024

EMPTY_AI_RESPONSE_DETAIL = (
    "The AI model returned no text. Raise the response token limit in your "
    "AI provider settings or choose a non-reasoning model."
)
TRUNCATED_AI_RESPONSE_DETAIL = (
    "The AI model's response was cut off at the response token limit. Raise "
    "the response token limit in your AI provider settings or choose a "
    "non-reasoning model."
)


class UnusableAIResponseError(HTTPException):
    """502 for an empty or length-truncated model response (issue #1020)."""

    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


def ensure_usable_ai_response(
    response: AIResponse,
    *,
    surface: str,
    user_id: uuid.UUID,
) -> None:
    """Refuse an empty or length-truncated response before it is stored.

    Reasoning models can spend the whole budget on hidden reasoning and
    return no visible text, or stop mid-sentence (issue #1020). Either
    way the output is unusable, so the caller gets a 502 instead of a
    stored blank or half-written brief/analysis.
    """
    empty = not response.content.strip()
    if empty:
        detail = EMPTY_AI_RESPONSE_DETAIL
    elif response.truncated:
        detail = TRUNCATED_AI_RESPONSE_DETAIL
    else:
        return

    logger.warning(
        "Refusing unusable AI response",
        surface=surface,
        user_id=str(user_id),
        empty=empty,
        truncated=response.truncated,
        output_tokens=response.usage.output_tokens,
    )
    raise UnusableAIResponseError(detail)


async def get_ai_client(
    user: User,
    db: AsyncSession,
) -> BaseAIClient:
    """Factory that returns the appropriate AI client for a user.

    Loads the user's AI provider configuration, decrypts the API key,
    and returns a configured client instance.

    Args:
        user: The authenticated user.
        db: Database session.

    Returns:
        A configured BaseAIClient subclass instance.

    Raises:
        HTTPException: 404 if no provider is configured.
    """
    from src.integrations.claude import ClaudeClient
    from src.integrations.openai_client import OpenAIClient

    result = await db.execute(
        select(AIProviderConfig).where(AIProviderConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI provider configured. Please configure an AI provider first.",
        )

    # Subscription types using sidecar OAuth may have no stored API key;
    # they use a placeholder key since the sidecar handles authentication.
    if config.encrypted_api_key:
        api_key = decrypt_credential(config.encrypted_api_key)
    else:
        api_key = settings.ai_sidecar_api_key or "sidecar-managed"
    model = config.model_name or DEFAULT_MODELS.get(config.provider_type, "")

    # For subscription types, auto-route through the managed sidecar
    # when no explicit base_url is configured.
    base_url = config.base_url
    if config.provider_type in _SUBSCRIPTION_TYPES and not base_url:
        base_url = f"{settings.ai_sidecar_url}/v1"

    if config.provider_type in _ANTHROPIC_SDK_TYPES:
        return ClaudeClient(
            api_key=api_key,
            model=model,
            provider_type=config.provider_type,
        )

    if config.provider_type in _OPENAI_SDK_TYPES:
        if not model:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No model specified. Please configure a model name for your provider.",
            )
        return OpenAIClient(
            api_key=api_key,
            model=model,
            base_url=base_url,
            provider_type=config.provider_type,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported AI provider: {config.provider_type}",
    )
