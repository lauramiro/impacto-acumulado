from pathlib import Path

import impacto.settings
from impacto.settings import load_settings


def test_load_settings_reads_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(impacto.settings, "LOCAL_ENV_FILE", tmp_path / "absent")
    monkeypatch.setenv("IMPACTO_DB_DSN", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("IMPACTO_LLM_KEY", "k")
    monkeypatch.setenv("IMPACTO_LLM_MODEL", "some-model")
    monkeypatch.setenv("IMPACTO_HTTP_CACHE", str(tmp_path))
    s = load_settings()
    assert s.db_dsn == "postgresql://u:p@localhost/db"
    assert s.llm_key == "k"
    assert s.llm_model == "some-model"
    assert s.http_cache == Path(tmp_path)


def test_load_settings_defaults(monkeypatch, tmp_path):
    monkeypatch.setattr(impacto.settings, "LOCAL_ENV_FILE", tmp_path / "absent")
    monkeypatch.delenv("IMPACTO_LLM_KEY", raising=False)
    monkeypatch.delenv("IMPACTO_LLM_MODEL", raising=False)
    monkeypatch.delenv("IMPACTO_HTTP_CACHE", raising=False)
    monkeypatch.setenv("IMPACTO_DB_DSN", "postgresql://x")
    s = load_settings()
    assert s.llm_key is None
    assert s.llm_model == "openai/gpt-oss-120b"
    assert s.http_cache.name == ".cache"
