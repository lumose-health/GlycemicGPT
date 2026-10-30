"""Story 5.2: Claude (Anthropic) AI client integration.

Implements the BaseAIClient interface for Claude models.
"""

from typing import Any

import anthropic

from src.logging_config import get_logger
from src.models.ai_provider import AIProviderType
from src.schemas.ai_response import AIMessage, AIResponse, AIUsage
from src.services.ai_client import BaseAIClient

logger = get_logger(__name__)


class ClaudeClient(BaseAIClient):
    """Claude AI client using the Anthropic SDK."""

    async def generate(
        self,
        messages: list[AIMessage],
        system_prompt: str | None = None,
        max_tokens: int = 1024,
    ) -> AIResponse:
        """Generate a response using the Anthropic Messages API.

        Args:
            messages: List of conversation messages.
            system_prompt: Optional system-level instruction.
            max_tokens: Maximum tokens in the response.

        Returns:
            Normalized AIResponse.
        """
        client = anthropic.AsyncAnthropic(api_key=self._api_key)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        try:
            response = await client.messages.create(**kwargs)
        except anthropic.AuthenticationError:
            logger.error("Claude API authentication failed during generation")
            raise
        except anthropic.RateLimitError:
            logger.warning("Claude API rate limited during generation")
            raise
        except anthropic.APIConnectionError as e:
            logger.error("Claude API connection error during generation", error=str(e))
            raise
        except Exception as e:
            logger.error("Unexpected error during Claude generation", error=str(e))
            raise

        content = response.content[0].text if response.content else ""

        usage = AIUsage()
        if response.usage:
            usage = AIUsage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        return AIResponse(
            content=content,
            model=response.model,
            provider=self._provider_type or AIProviderType.CLAUDE_API,
            usage=usage,
            truncated=getattr(response, "stop_reason", None) == "max_tokens",
        )
