from __future__ import annotations

import argparse
import contextlib
import logging
from collections.abc import Callable
from typing import get_args

import psycopg

from impacto.db.connect import connect
from impacto.db.documents import municipality_name_map, pending_for_extraction, save_extraction
from impacto.extract.operative import find_operative
from impacto.extract.prompts import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt
from impacto.extract.schema import ConditionCategory, DocType, Extraction, Technology, Verdict
from impacto.extract.sections import ORDER, split_sections
from impacto.extract.validate import validate_and_score
from impacto.providers import Provider, QuotaExhausted
from impacto.providers.factory import PROVIDER_NAMES, build_provider
from impacto.settings import load_settings

log = logging.getLogger(__name__)

# Groq's free tier for openai/gpt-oss-120b caps throughput at 8000 tokens per
# minute (see docs/sources.md, "LLM" section). At ~3 characters per token for
# Spanish legal text that is a ~24,000 character/minute budget shared by the
# request text, the completion, and (for this reasoning model) any hidden
# reasoning tokens. The system prompt alone is already ~2,400 chars (~800
# tokens), so a single request's section text is capped well below the full
# budget: 8,000 chars (~2,700 tokens) leaves headroom for the prompt
# scaffolding and a JSON completion without ever exceeding the hard per
# request ceiling, even though back-to-back sections for the same document
# will still often trip the per-minute limit and have to back off.
MAX_SECTION_CHARS = 8_000


def _chunks(text: str, size: int) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)] or [""]


# Sentinels the prompt reserves for "not stated" (doc_type) and "no verdict
# here" (verdict). A section chunk that has nothing to say about either
# returns JSON null for them rather than one of these strings, per the
# prompt's own "usa null cuando el texto no lo diga" instruction.
PLACEHOLDER_DOC_TYPE = "otro"
PLACEHOLDER_VERDICT = "no_aplica"

# Top-level fields the schema declares as a single Literal (not a list).
_SINGLE_VALUE_FIELDS = ("doc_type", "verdict", "technology")
_NUMERIC_FIELDS = ("mw_peak", "mw_nominal", "hectares", "turbines")
_INTEGER_FIELDS = ("turbines",)
# Fields that resolve matches exactly (expediente) or reads a phase token
# from (project_name) keep only their first value; the other plant names
# go to related_projects, which the schema already has for phases.
_FIRST_VALUE_FIELDS = ("project_name", "expediente")
_JOINED_FIELDS = ("developer",)
# Document types the operative-sentence rule may override. A model that
# evidenced modificacion, caducidad or informacion_publica read a document
# that merely quotes a decision, and the rule must not clobber it.
_OVERRIDABLE_DOC_TYPES = {"dia": {"dia", "otro"}, "aau": {"aau", "otro"}}


def _as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def _fold_numbers(value):
    """Sum a per-plant list or dict of numbers into one project total."""
    parts = value.values() if isinstance(value, dict) else value
    numbers = [n for n in (_as_number(p) for p in parts) if n is not None]
    return sum(numbers) if numbers else None


def _strings(value) -> list[str]:
    parts = value.values() if isinstance(value, dict) else value
    return [str(p).strip() for p in parts if p not in (None, "")]

def _as_coordinate(value):
    """Parse one UTM easting/northing, accepting the Spanish "254.321,50" form."""
    if isinstance(value, str) and "," in value and "." in value:
        value = value.replace(".", "")
    return _as_number(value)


def _as_zone(value):
    """Parse a UTM zone number; a non-numeric zone ("30S", a description) is dropped."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _clean_utm_coordinates(value) -> list[dict]:
    """Keep only entries that parse as a UTM point, coercing numeric strings."""
    clean = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        x, y = _as_coordinate(entry.get("x")), _as_coordinate(entry.get("y"))
        if x is None or y is None:
            continue
        clean.append({"x": x, "y": y, "zone": _as_zone(entry.get("zone"))})
    return clean

_ALLOWED_DOC_TYPES = set(get_args(DocType))
_ALLOWED_VERDICTS = set(get_args(Verdict))
_ALLOWED_TECHNOLOGIES = set(get_args(Technology))
_ALLOWED_CONDITION_CATEGORIES = set(get_args(ConditionCategory))
_DEFAULT_CONDITION_CATEGORY = "general"


def _sanitize(raw: dict) -> dict:
    """Normalise a raw per-chunk response before validating it as an Extraction.

    Observed live against Groq/openai-gpt-oss-120b:
    - A chunk that genuinely doesn't state a field returns explicit JSON
      null for it, including for list/dict fields whose schema default is
      an empty container, and for the required doc_type/verdict enums.
      Pydantic treats an explicit null differently from an omitted key and
      raises on both cases.
    - A mixed-technology project (e.g. three solar plants sharing one
      evacuation line) sometimes gets `technology` back as a list of values
      instead of the single Literal the schema requires; the first value is
      kept.
    - doc_type/verdict/technology sometimes come back as a near-synonym
      outside the schema's allowed values (e.g. "declaracion_impacto"
      instead of "dia", "aprobado" instead of "favorable"). Treated the same
      as "not stated": falls back to the placeholder (doc_type, verdict) or
      null (technology, which is optional).
    - `evidence` values are sometimes a JSON list of citations for a key
      instead of the single string `evidence: dict[str, str]` expects; the
      list is joined into one string. A null evidence value (nothing to
      cite for that key) is dropped rather than kept as null.
    - a condition's `category` is sometimes a value outside the schema's
      allowed set (e.g. "poblacion"); falls back to "general", the schema's
      own catch-all default for this field.
    Observed live against Mistral/ministral-14b on multi-plant resolutions:
    - numeric fields (mw, hectares, turbines) come back as one value per
      plant, as a list or a dict keyed by plant name; they are summed into
      the project total the labels use.
    - string fields (project_name, developer, expediente) come back as one
      value per plant; they are joined with "; ".
    - `utm_coordinates` sometimes lists MGRS 10 km grid squares ("SUF28") as
      a point's y, or a point with null x/y and a descriptive `zone`; an
      entry whose x and y do not parse as numbers is dropped, numeric
      strings (including the Spanish "254.321,50" form) are coerced, and a
      non-numeric zone becomes null.
    Any of these would otherwise fail the whole document over one section's
    reasonable but non-conforming answer.
    """
    raw = dict(raw)
    for name, field in Extraction.model_fields.items():
        if name in raw and raw[name] is None and field.default_factory is not None:
            raw[name] = field.default_factory()
    for name in _NUMERIC_FIELDS:
        if isinstance(raw.get(name), (list, dict)):
            raw[name] = _fold_numbers(raw[name])
        elif isinstance(raw.get(name), str):
            raw[name] = _as_number(raw[name])
    for name in _INTEGER_FIELDS:
        if isinstance(raw.get(name), float):
            raw[name] = round(raw[name])
    for name in _JOINED_FIELDS:
        if isinstance(raw.get(name), (list, dict)):
            strings = _strings(raw[name])
            raw[name] = "; ".join(strings) if strings else None
    for name in _FIRST_VALUE_FIELDS:
        if isinstance(raw.get(name), (list, dict)):
            strings = _strings(raw[name])
            raw[name] = strings[0] if strings else None
            if name == "project_name" and len(strings) > 1:
                related = raw.get("related_projects") or []
                raw["related_projects"] = list(related) + strings[1:]
    municipalities = raw.get("municipalities")
    if isinstance(municipalities, list):
        raw["municipalities"] = [
            m for m in municipalities if not isinstance(m, dict) or m.get("name")
        ]  # a municipality without a name is nothing to link (seen live from ministral-14b)
    if isinstance(raw.get("utm_coordinates"), list):
        raw["utm_coordinates"] = _clean_utm_coordinates(raw["utm_coordinates"])
    for name in _SINGLE_VALUE_FIELDS:
        if isinstance(raw.get(name), list):
            values = [v for v in raw[name] if v is not None]
            raw[name] = values[0] if values else None
    evidence = raw.get("evidence")
    if isinstance(evidence, dict):
        clean_evidence = {}
        for key, value in evidence.items():
            if value is None:
                continue  # nothing to cite is not evidence; dict[str, str] has no room for null
            if isinstance(value, list):
                value = "; ".join(str(v) for v in value)
            elif not isinstance(value, str):
                value = str(value)
            clean_evidence[key] = value
        raw["evidence"] = clean_evidence
    conditions = raw.get("conditions")
    if isinstance(conditions, list):
        clean_conditions = []
        for condition in conditions:
            if isinstance(condition, dict):
                if not condition.get("text"):
                    continue  # a condition without text is nothing to keep (seen live from ministral-14b)
                if condition.get("category") not in _ALLOWED_CONDITION_CATEGORIES:
                    condition = {**condition, "category": _DEFAULT_CONDITION_CATEGORY}
            clean_conditions.append(condition)
        raw["conditions"] = clean_conditions
    if raw.get("doc_type") not in _ALLOWED_DOC_TYPES:
        raw["doc_type"] = PLACEHOLDER_DOC_TYPE
    if raw.get("verdict") not in _ALLOWED_VERDICTS:
        raw["verdict"] = PLACEHOLDER_VERDICT
    if raw.get("technology") is not None and raw["technology"] not in _ALLOWED_TECHNOLOGIES:
        raw["technology"] = None
    return raw


def _decide_enum_field(parts: list[Extraction], field: str, placeholder: str) -> str:
    """Pick the document-level doc_type/verdict out of all the per-section parts.

    PLACEHOLDER_DOC_TYPE ("otro") and PLACEHOLDER_VERDICT ("no_aplica") are
    legitimate values in their own right, not just "not stated" sentinels,
    so a section's mere use of one can't be told apart from a real decision
    by value alone. Trust a section's value for this field only when that
    section cited evidence for it. Among evidenced values:
    - an evidenced non-placeholder beats an evidenced placeholder (observed
      live: a header section citing "no se menciona" for no_aplica must not
      lock out the operative sentence that follows);
    - among evidenced non-placeholders the LAST wins, because the operative
      sentence sits at the end of a resolution;
    - if only placeholders were evidenced, the placeholder is a real answer.
    If no section evidenced this field, fall back to the last non-placeholder
    unevidenced value seen, else the placeholder itself.
    """
    evidenced_value: str | None = None
    evidenced_placeholder = False
    fallback = placeholder
    for part in parts:
        value = getattr(part, field)
        if part.evidence.get(field):
            if value == placeholder:
                evidenced_placeholder = True
            else:
                evidenced_value = value
        elif value != placeholder:
            fallback = value
    if evidenced_value is not None:
        return evidenced_value
    if evidenced_placeholder:
        return placeholder
    return fallback


def extract_document(provider: Provider, title: str, text: str, municipality_names: dict[str, str]) -> Extraction:
    sections = split_sections(text)
    parts: list[Extraction] = []
    for key in ORDER:
        body = sections.get(key, "")
        if not body.strip():
            continue
        for index, chunk in enumerate(_chunks(body, MAX_SECTION_CHARS)):
            raw = provider.complete_json(SYSTEM_PROMPT, build_user_prompt(key, chunk, title))
            part = Extraction.model_validate(_sanitize(raw))
            log.info(
                "section %s chunk %d: doc_type=%s verdict=%s evidence=%s",
                key,
                index,
                part.doc_type,
                part.verdict,
                sorted(part.evidence),
            )
            parts.append(part)
    if not parts:
        raise ValueError("document has no text")
    merged = parts[0]
    for part in parts[1:]:
        merged = merged.merge(part)
    data = merged.model_dump()
    data["doc_type"] = _decide_enum_field(parts, "doc_type", PLACEHOLDER_DOC_TYPE)
    data["verdict"] = _decide_enum_field(parts, "verdict", PLACEHOLDER_VERDICT)
    operative = find_operative(text)
    if operative is not None and data["doc_type"] in _OVERRIDABLE_DOC_TYPES[operative.doc_type]:
        # The ministry's and the Junta's decision forms are fixed wording; the
        # rule is more reliable than a model reading them, so it wins for
        # documents the model read as that decision or as nothing in particular.
        log.info("operative sentence: doc_type=%s verdict=%s", operative.doc_type, operative.verdict)
        data["doc_type"] = operative.doc_type
        data["verdict"] = operative.verdict
        data["evidence"] = {**data["evidence"], "verdict": operative.sentence, "doc_type": operative.sentence}
    merged = Extraction.model_validate(data)
    return validate_and_score(merged, municipality_names)


def _save_with_reconnect(
    conn: psycopg.Connection, reconnect: Callable[[], psycopg.Connection] | None, *args
) -> psycopg.Connection:
    """save_extraction, retried once on a fresh connection if the server dropped ours.

    Neon terminates an idle connection ("terminating connection due to
    administrator command") when the endpoint suspends or restarts, which
    can happen while a run is minutes deep in LLM calls. Returns the
    connection to keep using, which is the new one after a reconnect.
    """
    try:
        save_extraction(conn, *args)
    except psycopg.OperationalError as exc:
        if reconnect is None:
            raise
        log.warning("database connection lost (%s), reconnecting", str(exc).strip().splitlines()[0])
        with contextlib.suppress(Exception):
            conn.close()  # already dead; closing only releases the client side
        conn = reconnect()
        save_extraction(conn, *args)
    return conn


def run_extract(
    conn: psycopg.Connection,
    provider: Provider,
    limit: int,
    redo_prompt_version: str | None = None,
    reconnect: Callable[[], psycopg.Connection] | None = None,
) -> int:
    names = municipality_name_map(conn)
    rows = pending_for_extraction(conn, limit, redo_prompt_version)
    # Both reads are done: commit so no transaction (and no snapshot or
    # pooled-connection lease) stays open across the minutes of LLM calls
    # that follow. save_extraction opens and commits its own.
    conn.commit()
    original = conn
    done = 0
    for row in rows:
        try:
            extraction = extract_document(provider, row["title"], row["text"], names)
        except QuotaExhausted as exc:
            # Not the document's fault: record nothing against it (no attempt
            # consumed) and stop, since every remaining document would hit
            # the same wall until the quota resets.
            log.warning("provider quota exhausted, stopping after %d document(s): %s", done, exc)
            break
        except Exception as exc:  # noqa: BLE001 - any failure is recorded, never fatal
            log.warning("document %s failed: %s", row["id"], exc)
            conn = _save_with_reconnect(
                conn, reconnect, row["id"], provider.name, PROMPT_VERSION, None, None, str(exc)[:2000]
            )
            continue
        conn = _save_with_reconnect(
            conn, reconnect, row["id"], provider.name, PROMPT_VERSION, extraction.model_dump(), extraction.confidence, None
        )
        done += 1
        log.info("document %s extracted (confidence %.2f)", row["id"], extraction.confidence)
    if conn is not original:
        conn.close()  # opened here by reconnect; the caller only owns the original
    return done


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto extract")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--provider", choices=PROVIDER_NAMES, default="groq")
    parser.add_argument(
        "--redo-prompt-version",
        default=None,
        help="also re-extract documents whose ok extraction used this prompt version",
    )
    args = parser.parse_args(argv)
    settings = load_settings()
    provider = build_provider(settings, args.provider)
    with connect(settings.db_dsn) as conn:
        n = run_extract(conn, provider, args.limit, args.redo_prompt_version, reconnect=lambda: connect(settings.db_dsn))
    print(f"extracted {n} document(s)")
    return 0
