"""Deterministic reading of the operative sentence of a resolution.

The ministry and the Andalusian environment department write their
decisions in fixed forms. A small model reads those forms unreliably (the
favourable DIA form does not contain the word "favorable" at all), so the
operative sentence is matched by rule and, for documents the model reads as
a DIA, an AAU or nothing in particular, takes precedence over the model's
guess for doc_type and verdict. The LLM still extracts everything else.

Forms handled (matched on normalised text: lowercase, no accents):

- "formula declaracion de impacto ambiental desfavorable ... proyecto"
  -> dia, desfavorable
- "formula declaracion de impacto ambiental desfavorable a la realizacion
  de la linea/infraestructura de evacuacion ... y establece las condiciones"
  -> dia, favorable_condicionada (only the evacuation line is refused; the
  plants get conditions)
- "formula declaracion de impacto ambiental ... proyecto" with no adjective
  -> dia, favorable_condicionada (the ministry's favourable form)
- "otorgar/se otorga la autorizacion ambiental unificada"
  -> aau, favorable_condicionada
- "no otorgar/denegar/se deniega/desestimar ... autorizacion ambiental
  unificada" -> aau, desfavorable
- "no es necesario el sometimiento al procedimiento de evaluacion ambiental
  ordinaria" (simplified evaluation, Ley 21/2013 article 47)
  -> informe_impacto, favorable_condicionada
- "es necesario el sometimiento ..." / "debe someterse a ... evaluacion ...
  ordinaria" -> informe_impacto, no_aplica (the report routes the procedure
  and says nothing about the project's effects)
- publication notices (Ley 7/2007, art. 31.7: "dar publicidad al informe
  vinculante ..."): "autorizacion ambiental unificada otorgada" or "se otorga
  autorizacion ambiental unificada" -> aau, favorable_condicionada; "se otorga
  modificacion de" or "se modifica la autorizacion ambiental unificada" ->
  modificacion, favorable_condicionada; "se deniega" or "no se otorga la
  autorizacion ambiental unificada" -> aau, desfavorable; "se archiva la autorizacion ambiental
  unificada" -> caducidad (the procedure ended without a decision). Most of
  these notices state no verdict at all (the full text is only on the
  department's website) and get none.

The publication forms are read only after a "dar publicidad" phrase, because a
consultation on modifying an AAU also mentions "la autorizacion ambiental
unificada otorgada por resolucion de ...". AAU verbs and the simplified-evaluation forms are only read inside the resolving
part of the document (after the last "resuelve", "ha resuelto", "acuerda" or
similar marker), because the same verbs appear in legal boilerplate of
public-consultation notices. The simplified form's legal grounds quote both halves
of article 47 before the operative sentence, and its opening, "formula informe de
impacto ambiental", appears only in the title.
When several operative sentences appear (a resolution that quotes an earlier
one), the last match wins: the document's own decision closes the text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from impacto.text import normalize

_DIA = re.compile(
    r"formular? (?:la )?declaracion de impacto ambiental(?P<adj> desfavorable| favorable)?"
    r"(?P<rest>.{0,400})"
)
_PROJECT_OBJECT = re.compile(r"^\s*(?:(?:a|para) la realizacion )?(?:del|para el|al|sobre el|de el) proyecto")
_LINE_OBJECT = re.compile(
    r"^\s*(?:(?:a|para) la realizacion )?de (?:la|las) (?:linea|lineas|infraestructuras? de evacuacion)\b"
)
_CONDITIONS = re.compile(r"establece(?:n)? las condiciones")
_RESOLVING_MARKER = re.compile(r"\b(?:resuelve|ha resuelto|resuelvo|acuerda|dispongo|dispone)\b")
_AAU_GRANT = re.compile(r"(?<!\bno )(?:otorgar|se otorga|conceder|se concede) (?:la )?autorizacion ambiental unificada")
_AAU_DENY = re.compile(
    r"(?:no otorgar|denegar|se deniega|desestimar) (?:la solicitud de )?(?:la )?autorizacion ambiental unificada"
)
_PUBLICITY = re.compile(r"\b(?:dar|da|se da|procede a dar) publicidad\b")
_PUBLISHED_GRANT = re.compile(
    r"autorizacion ambiental unificada (?:simplificada )?otorgada|(?<!\bno )se otorga (?:la )?autorizacion ambiental unificada"
)
_PUBLISHED_MODIFICATION = re.compile(
    r"se otorga (?:la )?modificacion de (?:la )?autorizacion ambiental unificada|se modifica (?:la )?autorizacion ambiental unificada"
)
_PUBLISHED_REFUSAL = re.compile(
    r"(?:se deniega|no se otorga) (?:la )?autorizacion ambiental unificada"
    r"|autorizacion ambiental unificada (?:simplificada )?(?:denegada|no otorgada)"
)
# An archived procedure ended without a decision: the project lapses.
_PUBLISHED_ARCHIVE = re.compile(r"se archiva (?:la )?autorizacion ambiental unificada")
# A correction notice quotes the wrong text ("donde dice: ... se otorga ...")
# before the right one ("debe decir: ... se deniega ..."); the wrong text never counts.
_CORRECTED_TEXT = re.compile(r"donde dice.*?debe decir")
_IIA_NOT_NEEDED = re.compile(
    r"no es necesari[oa] (?:el sometimiento|someter(?:lo)?) (?:al procedimiento de |a )?"
    r"evaluacion (?:de impacto )?ambiental ordinaria"
)
_IIA_NEEDED = re.compile(
    r"(?<!\bno )(?:es necesari[oa] (?:el sometimiento|someter(?:lo)?)|debe someterse) "
    r"(?:al procedimiento de |a (?:una )?)?evaluacion (?:de impacto )?ambiental ordinaria"
)


# The doc_type the model must have given for the rule to win: the decision it
# states, or nothing in particular. A notice the model read as a consultation
# keeps its doc_type, since consultation boilerplate quotes decision verbs.
OVERRIDABLE_DOC_TYPES = {
    "dia": {"dia", "otro"},
    "aau": {"aau", "otro"},
    "informe_impacto": {"informe_impacto", "otro"},
    "modificacion": {"modificacion", "aau", "otro"},
    "caducidad": {"caducidad", "aau", "otro"},
}


@dataclass(frozen=True)
class OperativeHit:
    doc_type: str
    verdict: str
    sentence: str


def _dia_hit(match: re.Match) -> OperativeHit | None:
    adjective = (match.group("adj") or "").strip()
    rest = match.group("rest")
    sentence = match.group(0)[:300]
    if adjective == "desfavorable":
        if _PROJECT_OBJECT.match(rest):
            return OperativeHit("dia", "desfavorable", sentence)
        if _LINE_OBJECT.match(rest):
            verdict = "favorable_condicionada" if _CONDITIONS.search(rest) else "desfavorable"
            return OperativeHit("dia", verdict, sentence)
        return OperativeHit("dia", "desfavorable", sentence)
    if _PROJECT_OBJECT.match(rest) or adjective == "favorable":
        return OperativeHit("dia", "favorable_condicionada", sentence)
    return None


def _resolving_part(n: str) -> tuple[int, str] | None:
    """Offset and text of the document after its last resolving marker."""
    last = None
    for match in _RESOLVING_MARKER.finditer(n):
        last = match
    if last is None:
        return None
    return last.start(), n[last.start() :]


# The decisions a title states reliably: the AAU forms. A ministry DIA's
# title never states its adjective, so its favourable form would read every
# refusal as granted.
TITLE_DOC_TYPES = {"aau", "modificacion", "caducidad"}
# A title that is the decision itself: "Acuerdo de 26 de septiembre de 2024,
# de la Delegación ..., por el que se otorga autorización ambiental unificada
# para planta fotovoltaica ...". "se otorga la modificación de la ..." does
# not match: "autorizacion" must follow the verb.
_TITLE_DECISION = re.compile(
    r"\bpor (?:el|la) que (?P<verb>se otorga|no se otorga|se deniega) (?:la )?autorizacion ambiental unificada"
)


def title_override(doc_type: str, title: str) -> OperativeHit | None:
    """The decision a title states, for a document whose body states none: an AAU form only."""
    hit = find_operative(title)
    if hit is None or hit.doc_type not in TITLE_DOC_TYPES:
        hit = None
        if m := _TITLE_DECISION.search(normalize(title)):
            verdict = "favorable_condicionada" if m.group("verb") == "se otorga" else "desfavorable"
            hit = OperativeHit("aau", verdict, m.group(0))
    return hit if hit is not None and doc_type in OVERRIDABLE_DOC_TYPES[hit.doc_type] else None


def operative_override(doc_type: str, text: str) -> OperativeHit | None:
    """The rule's decision when it should replace a model's doc_type and verdict, else None."""
    hit = find_operative(text)
    return hit if hit is not None and doc_type in OVERRIDABLE_DOC_TYPES[hit.doc_type] else None


def find_operative(text: str) -> OperativeHit | None:
    """Return the decision stated by the last operative sentence, if any."""
    # Blanked rather than removed, so offsets (and "last match wins") still hold.
    n = _CORRECTED_TEXT.sub(lambda m: " " * len(m.group(0)), normalize(text))
    hits: list[tuple[int, OperativeHit]] = []
    for match in _DIA.finditer(n):
        hit = _dia_hit(match)
        if hit is not None:
            hits.append((match.start(), hit))
    resolving = _resolving_part(n)
    if resolving is not None:
        offset, part = resolving
        for match in _AAU_DENY.finditer(part):
            hits.append((offset + match.start(), OperativeHit("aau", "desfavorable", match.group(0))))
        for match in _AAU_GRANT.finditer(part):
            hits.append((offset + match.start(), OperativeHit("aau", "favorable_condicionada", match.group(0))))
        for match in _IIA_NOT_NEEDED.finditer(part):
            hits.append((offset + match.start(), OperativeHit("informe_impacto", "favorable_condicionada", match.group(0))))
        for match in _IIA_NEEDED.finditer(part):
            hits.append((offset + match.start(), OperativeHit("informe_impacto", "no_aplica", match.group(0))))
    publicity = _PUBLICITY.search(n)
    if publicity is not None:
        after = n[publicity.start() :]
        for match in _PUBLISHED_GRANT.finditer(after):
            hits.append((publicity.start() + match.start(), OperativeHit("aau", "favorable_condicionada", match.group(0))))
        for match in _PUBLISHED_MODIFICATION.finditer(after):
            hits.append((publicity.start() + match.start(), OperativeHit("modificacion", "favorable_condicionada", match.group(0))))
        for match in _PUBLISHED_REFUSAL.finditer(after):
            hits.append((publicity.start() + match.start(), OperativeHit("aau", "desfavorable", match.group(0))))
        for match in _PUBLISHED_ARCHIVE.finditer(after):
            hits.append((publicity.start() + match.start(), OperativeHit("caducidad", "no_aplica", match.group(0))))
    if not hits:
        return None
    hits.sort(key=lambda pair: pair[0])
    return hits[-1][1]
