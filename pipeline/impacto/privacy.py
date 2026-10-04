"""Remove personal data from announcement text before it is stored or sent anywhere.

BOE section V announcements on energy projects can end with a list of the
land and rights a project would take, with each owner's name and identity
number ("relación concreta e individualizada de bienes y derechos
afectados"). The site needs none of it, so the list and everything after it
are cut before the text reaches the database, the HTTP cache or the LLM.

If an identity number is still in the text after the cut, the list was not
where the rule expects it, and the announcement is held back for a person to
review rather than stored whole.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from impacto.text import strip_accents

# The heading of the owner list, matched on lowercased, accent-free text.
_OWNER_LIST = re.compile(r"relacion (?:concreta e individualizada )?de (?:los )?bienes,? (?:y|e|o) derechos")
# Spanish DNI and NIE numbers, whole or with the BOE's masking (***4567**).
_IDENTITY = re.compile(r"\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b|\*{3}\d{4}\*{2}")
# A labelled owner left behind.
_OWNER_LABEL = re.compile(r"\btitular(?:es)?\s*:", re.IGNORECASE)


@dataclass(frozen=True)
class StripResult:
    text: str
    removed_chars: int
    held_back: bool
    reason: str = ""


def strip_personal_annex(text: str) -> StripResult:
    """The text up to the owner list, how much was cut, and whether to hold it back."""
    # Folded one character at a time so positions in `folded` are positions in
    # `text` (a ligature or a multi-character lowercase would shift them).
    folded = "".join((strip_accents(c)[:1] or c).lower()[:1] or c for c in text)
    match = _OWNER_LIST.search(folded)
    kept = text if match is None else text[: match.start()]
    # Drop an "Anexo:" label left dangling just before the list.
    kept = re.sub(r"(?i)\s*anexo\s*[:.]?\s*$", "", kept).rstrip()
    removed = len(text) - len(kept)
    if _IDENTITY.search(kept):
        return StripResult(kept, removed, True, "an identity number remains after the cut")
    if _OWNER_LABEL.search(kept):
        return StripResult(kept, removed, True, "a 'titular:' label remains after the cut")
    return StripResult(kept, removed, False)
