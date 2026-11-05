"""Story 5.2: AI response schemas.

Common response schemas shared across all AI providers.
"""

from pydantic import BaseModel, Field

from src.models.ai_provider import AIProviderType


class AIMessage(BaseModel):
    """A single message in an AI conversation."""

    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class AIUsage(BaseModel):
    """Token usage information from an AI provider response."""

    input_tokens: int = Field(default=0, description="Tokens in the prompt")
    output_tokens: int = Field(default=0, description="Tokens in the response")


class AIResponse(BaseModel):
    """Normalized response from any AI provider."""

    content: str = Field(..., description="Generated text content")
    model: str = Field(..., description="Model that generated the response")
    provider: AIProviderType = Field(..., description="AI provider used")
    usage: AIUsage = Field(
        default_factory=AIUsage, description="Token usage information"
    )
    truncated: bool = Field(
        default=False,
        description="True when the provider stopped because it hit max_tokens",
    )
