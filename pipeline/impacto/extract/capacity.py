"""Peak and nominal capacity as the gazette labels them.

The model often swaps or merges the two figures: it reads "109,52 MWp" as the
nominal capacity, or sums peaks into a nominal. A figure the text labels
explicitly ("61,2 MWp/51 MWn", "51 MWnom", "250 MW pico") is not ambiguous,
so this rule reads it and corrects the model, the way the operative-sentence
rule corrects the verdict. It is re-applied at resolve, so no model call is
needed.

Only an unambiguous figure is used: one distinct value per label in the title.
When the title labels neither, the body is read only for a single "X MWp / Y
MWn" pair, one plant's two figures side by side. A title naming several plants
("Plantas", "Parques", "cada uno") is left to the model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_NUMBER = r"(\d{1,4}(?:[.,]\d{1,4})?)"
_PEAK = re.compile(
    _NUMBER + r"\s*(?:MWp\b|MW\s*p\b|MW\s+pico\b|MW\s+de\s+potencia\s+pico\b|megavatios\s+pico\b)",
    re.IGNORECASE,
)
_NOMINAL = re.compile(
    _NUMBER
    + r"\s*(?:MWn\b|MWnom\b|MW\s*n\b|MW\s+nominal(?:es)?\b|MW\s+de\s+potencia\s+nominal\b|MWac\b|megavatios\s+nominales\b)",
    re.IGNORECASE,
)
SAME = 0.02  # the evaluation's tolerance for a capacity figure


def _number(s: str) -> float:
    return float(s.replace(",", "."))


@dataclass(frozen=True)
class Labelled:
    nominal: float | None
    peak: float | None


# "61,2 MWp/51 MWn", "109,52 MWp (90,75 MWn)": one plant's two figures side by side.
_PAIR = re.compile(
    _NUMBER + r"\s*MWp\b[\s/(,y-]{1,6}" + _NUMBER + r"\s*(?:MWn\b|MWnom\b|MW\s+nominal(?:es)?\b)",
    re.IGNORECASE,
)
# "una potencia pico de 199,976 Mwp, una potencia nominal de 160 MW".
_WORDED_PAIR = re.compile(
    r"potencia\s+pico\s+de\s+"
    + _NUMBER
    + r"\s*MWp?\b[\s,y]{0,6}(?:una\s+)?potencia\s+nominal\s+de\s+"
    + _NUMBER
    + r"\s*MW",
    re.IGNORECASE,
)
# A title naming several plants, or a figure "cada uno", gives no single plant's capacity.
_SEVERAL = re.compile(r"\b(?:plantas|parques|instalaciones|cada\s+un[oa])\b", re.IGNORECASE)


def _single(pattern: re.Pattern, text: str) -> float | None:
    """The labelled figure when the text states exactly one; a repeated figure ("116,5 MWp y 116,5 MWp") is two plants."""
    found = pattern.findall(text or "")
    return round(_number(found[0]), 4) if len(found) == 1 else None


_ANY_MW = re.compile(_NUMBER + r"\s*(?:MW|megavatios)", re.IGNORECASE)


def labelled_capacity(title: str, body: str = "") -> Labelled:
    title = title or ""
    # "Filabres, 153 MW, Peregiles, 93 MW, y La Rambla, 100 MWp": figures of several plants.
    figures = len(_ANY_MW.findall(title))
    labelled = len(_PEAK.findall(title)) + len(_NOMINAL.findall(title))
    if _SEVERAL.search(title) or figures > 2 or (figures == 2 and labelled < 2):
        return Labelled(None, None)
    peak, nominal = _single(_PEAK, title), _single(_NOMINAL, title)
    if nominal is None and not _NOMINAL.search(title) and body:
        pairs = {
            (round(_number(p), 4), round(_number(n), 4))
            for p, n in _PAIR.findall(body) + _WORDED_PAIR.findall(body)
        }
        if peak is not None:
            # The title's peak, with the nominal the body gives beside it ("109,52 MWp (90,75 MWn)").
            pairs = {(p, n) for p, n in pairs if _close(p, peak)}
        elif _PEAK.search(title):
            pairs = set()
        if len(pairs) == 1:
            peak, nominal = next(iter(pairs))
    return Labelled(nominal, peak)


def _close(a: float | None, b: float | None) -> bool:
    return a is not None and b is not None and abs(a - b) <= SAME * max(abs(a), 1e-9)


def with_capacity(payload: dict, title: str, body: str = "") -> dict:
    """The payload with labelled peak and nominal figures applied.

    A labelled figure replaces the model's. A model figure that equals the
    other label's figure was a misread and is cleared ("109,52 MWp" read as
    nominal leaves the nominal empty, so totals fall back to the peak and say so).
    """
    found = labelled_capacity(title, body)
    if found.nominal is None and found.peak is None:
        return payload
    out = dict(payload)
    # Resolve prefers a labelled figure over the latest unlabelled one ("109,5039 MW").
    if found.peak is not None:
        out["mw_peak"] = found.peak
        out["mw_peak_labelled"] = True
    if found.nominal is not None:
        out["mw_nominal"] = found.nominal
        out["mw_nominal_labelled"] = True
    elif found.peak is not None and _close(payload.get("mw_nominal"), found.peak):
        out["mw_nominal"] = None
    if (
        found.peak is None
        and found.nominal is not None
        and _close(payload.get("mw_peak"), found.nominal)
    ):
        out["mw_peak"] = None
    return out
