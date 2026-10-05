"""Remove personal data from announcement text before it is stored or sent anywhere.

BOE section V announcements on energy projects can end with a list of the
land and rights a project would take, with each owner's name and identity
number ("relación concreta e individualizada de bienes y derechos
afectados"). The site needs none of it, so the list and everything after it
are cut before the text reaches the database, the HTTP cache or the LLM.

The cut is made at a paragraph: the one that opens the list (its heading,
alone or after "Anexo"), or the first owner row ("Titular:", "Finca n").
A sentence that only mentions the list ("...la relación de bienes y derechos
que figura como anexo") is kept, with what follows it: public-utility notices
state their objection period after that sentence.

If an identity number or an owner label is still in the text after the cut,
the list was not where the rule expects it, and the announcement is held back
for a person to review rather than stored whole.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from impacto.text import strip_accents

# A paragraph that opens the owner list, matched on lowercased, accent-free text.
_LIST_HEADING = re.compile(
    r"^(?:anexo\s*[ivx0-9]*\s*[:.\-]?\s*)?relacion (?:concreta e individualizada )?de (?:los )?bienes,? (?:y|e|o) derechos"
)
# A bare "ANEXO" paragraph right before the list goes with it.
_ANNEX_LABEL = re.compile(r"^anexo\s*[ivx0-9]*\s*[:.\-]?\s*$")
# An owner row.
_OWNER_ROW = re.compile(r"\btitular(?:es)?\s*:|^finca\s*(?:n[ºo.]*\s*)?\d")
# Spanish DNI and NIE numbers, whole or with the BOE's masking (***4567**).
_IDENTITY = re.compile(r"\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b|\*{3}\d{4}\*{2}")


@dataclass(frozen=True)
class StripResult:
    text: str
    removed_chars: int
    held_back: bool
    reason: str = ""


def _fold(paragraph: str) -> str:
    return strip_accents(paragraph).lower().strip()


def strip_personal_annex(text: str) -> StripResult:
    """The text before the owner list, how much was cut, and whether to hold it back."""
    paragraphs = text.split("\n")
    cut = len(paragraphs)
    for i, paragraph in enumerate(paragraphs):
        folded = _fold(paragraph)
        if _LIST_HEADING.search(folded) or _OWNER_ROW.search(folded):
            cut = i
            if i > 0 and _ANNEX_LABEL.match(_fold(paragraphs[i - 1])):
                cut = i - 1
            break
    kept = "\n".join(paragraphs[:cut]).rstrip()
    removed = len(text) - len(kept)
    if _IDENTITY.search(kept):
        return StripResult(kept, removed, True, "an identity number remains after the cut")
    if re.search(r"\btitular(?:es)?\s*:", kept, re.IGNORECASE):
        return StripResult(kept, removed, True, "a 'titular:' label remains after the cut")
    return StripResult(kept, removed, False)


def has_identity_number(text: str) -> bool:
    """True when the text holds a DNI, NIE or masked identity number."""
    return bool(_IDENTITY.search(text))
