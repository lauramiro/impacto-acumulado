from pathlib import Path

import pytest

from impacto.providers.factory import build_provider
from impacto.providers.mistral import MistralProvider
from impacto.providers.stub import StubProvider
from impacto.settings import Settings


def _settings(**overrides) -> Settings:
    values = {
        "db_dsn": "postgresql://x",
        "llm_key": None,
        "llm_model": "groq-model",
        "mistral_key": None,
        "mistral_model": "mistral-model",
        "http_cache": Path("."),
    }
    return Settings(**{**values, **overrides})


def test_stub_builds_stub_provider():
    assert isinstance(build_provider(_settings(), "stub"), StubProvider)


def test_mistral_without_key_exits_naming_the_variable():
    with pytest.raises(SystemExit) as info:
        build_provider(_settings(), "mistral")
    assert "IMPACTO_MISTRAL_KEY" in str(info.value)


def test_mistral_with_key_builds_named_provider():
    provider = build_provider(_settings(mistral_key="k"), "mistral")
    assert isinstance(provider, MistralProvider)
    assert provider.name == "mistral:mistral-model"


def test_groq_without_key_exits_naming_the_variable():
    with pytest.raises(SystemExit) as info:
        build_provider(_settings(), "groq")
    assert "IMPACTO_LLM_KEY" in str(info.value)


def test_unknown_provider_name_is_an_error():
    with pytest.raises(ValueError):
        build_provider(_settings(), "nope")
