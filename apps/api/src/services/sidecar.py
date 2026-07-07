"""Story 15.2 / 15.4: Sidecar communication service.

Handles all HTTP communication between the FastAPI backend and the
AI sidecar container.  The sidecar is only reachable on the Docker
internal network (http://ai-sidecar:3456 by default).

Story 15.4: Added validate_sidecar_connection for subscription provider validation.
"""

import httpx

from src.config import settings
from src.logging_config import get_logger

logger = get_logger(__name__)

# Timeout for sidecar requests (seconds)
_TIMEOUT = 10.0


def _headers() -> dict[str, str]:
    """Build request headers including optional bearer token."""
    h: dict[str, str] = {"Content-Type": "application/json"}
    if settings.ai_sidecar_api_key:
        h["Authorization"] = f"Bearer {settings.ai_sidecar_api_key}"
    return h


async def get_sidecar_health() -> dict | None:
    """GET /health on the sidecar.

    Returns the parsed JSON body, or ``None`` if the sidecar is
    unreachable.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # /health skips auth on the sidecar, but include headers
            # for consistency and forward-compatibility.
            resp = await client.get(
                f"{settings.ai_sidecar_url}/health",
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Sidecar health check failed", error=str(exc))
        return None


async def get_sidecar_auth_status() -> dict | None:
    """GET /auth/status on the sidecar.

    Returns ``{"claude": {"authenticated": bool}, "codex": {"authenticated": bool},
    "copilot": {"authenticated": bool}}`` or ``None`` if the sidecar is unreachable.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{settings.ai_sidecar_url}/auth/status",
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Sidecar auth status check failed", error=str(exc))
        return None


async def start_sidecar_auth(provider: str) -> dict | None:
    """POST /auth/start on the sidecar.

    Returns the auth method info, or ``None`` on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.ai_sidecar_url}/auth/start",
                headers=_headers(),
                json={"provider": provider},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Sidecar auth start failed", provider=provider, error=str(exc))
        return None


async def submit_sidecar_token(provider: str, token: str) -> dict | None:
    """POST /auth/token on the sidecar.

    Forwards the user-provided token for storage.
    Returns ``{"success": true, "provider": "..."}`` or ``None`` on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.ai_sidecar_url}/auth/token",
                headers=_headers(),
                json={"provider": provider, "token": token},
            )
            if resp.status_code == 400:
                data = resp.json()
                return {"success": False, "error": data.get("error", "Invalid token")}
            if resp.status_code >= 400:
                return {
                    "success": False,
                    "error": f"Sidecar returned HTTP {resp.status_code}",
                }
            return resp.json()
    except Exception as exc:
        logger.warning(
            "Sidecar token submission failed", provider=provider, error=str(exc)
        )
        return None


_VALID_SIDECAR_PROVIDERS = {"claude", "codex", "copilot"}


async def validate_sidecar_connection(provider: str) -> tuple[bool, str | None]:
    """Validate that the sidecar is healthy and authenticated for a provider.

    Checks sidecar health and auth status. Used when configuring or testing
    subscription providers.

    Args:
        provider: Sidecar provider name ("claude", "codex", or "copilot").

    Returns:
        Tuple of (success, error_message).
    """
    if provider not in _VALID_SIDECAR_PROVIDERS:
        return (
            False,
            f"Unknown sidecar provider '{provider}'. Must be one of: {', '.join(sorted(_VALID_SIDECAR_PROVIDERS))}.",
        )

    health = await get_sidecar_health()
    if health is None:
        return (
            False,
            "AI sidecar is not reachable. Ensure the sidecar container is running.",
        )

    if health.get("status") != "ok":
        return False, f"AI sidecar reported unhealthy status: {health.get('status')}"

    auth_key = f"{provider}_auth"
    if not health.get(auth_key, False):
        return (
            False,
            f"Sidecar is running but not authenticated for {provider}. "
            "Please submit a token first.",
        )

    return True, None


async def revoke_sidecar_auth(provider: str) -> dict | None:
    """POST /auth/revoke on the sidecar.

    Tells the sidecar to delete the stored token.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.ai_sidecar_url}/auth/revoke",
                headers=_headers(),
                json={"provider": provider},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Sidecar auth revoke failed", provider=provider, error=str(exc))
        return None
