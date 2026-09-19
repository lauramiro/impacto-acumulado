from __future__ import annotations

from impacto.providers import Provider
from impacto.settings import Settings

PROVIDER_NAMES = ("groq", "mistral", "stub")


def build_provider(settings: Settings, name: str) -> Provider:
    """Build the provider a CLI `--provider` flag names.

    Raises SystemExit with the missing variable's name when the chosen
    provider's key is unset, so both CLIs fail the same way.
    """
    if name == "groq":
        if not settings.llm_key:
            raise SystemExit("IMPACTO_LLM_KEY is not set")
        from impacto.providers.groq import GroqProvider

        return GroqProvider(settings.llm_key, settings.llm_model)
    if name == "mistral":
        if not settings.mistral_key:
            raise SystemExit("IMPACTO_MISTRAL_KEY is not set")
        from impacto.providers.mistral import MistralProvider

        return MistralProvider(settings.mistral_key, settings.mistral_model)
    if name == "stub":
        from impacto.providers.stub import StubProvider

        return StubProvider([])
    raise ValueError(f"unknown provider {name!r}; expected one of {', '.join(PROVIDER_NAMES)}")
