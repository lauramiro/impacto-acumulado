from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_MODEL = "openai/gpt-oss-120b"
DEFAULT_MISTRAL_MODEL = "ministral-14b-latest"


@dataclass(frozen=True)
class Settings:
    db_dsn: str
    llm_key: str | None
    llm_model: str
    mistral_key: str | None
    mistral_model: str
    http_cache: Path


PIPELINE_DIR = Path(__file__).resolve().parents[1]
LOCAL_ENV_FILE = PIPELINE_DIR / "env.local"


def load_settings() -> Settings:
    load_dotenv(LOCAL_ENV_FILE, override=False)
    dsn = os.environ.get("IMPACTO_DB_DSN")
    if not dsn:
        raise RuntimeError("IMPACTO_DB_DSN is not set")
    return Settings(
        db_dsn=dsn,
        llm_key=os.environ.get("IMPACTO_LLM_KEY") or None,
        llm_model=os.environ.get("IMPACTO_LLM_MODEL") or DEFAULT_MODEL,
        mistral_key=os.environ.get("IMPACTO_MISTRAL_KEY") or None,
        mistral_model=os.environ.get("IMPACTO_MISTRAL_MODEL") or DEFAULT_MISTRAL_MODEL,
        http_cache=Path(os.environ.get("IMPACTO_HTTP_CACHE") or PIPELINE_DIR / ".cache"),
    )
