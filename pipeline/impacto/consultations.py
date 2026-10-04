"""Objection periods of información pública notices, and their deadlines.

The period is a stock phrase in Andalusian notices ("durante el plazo de
treinta (30) días hábiles"), so it is read from the text with a pattern, not
by the LLM, and the matched phrase is kept as evidence. A notice that states
no period gets none: no default is assumed.

Deadlines follow Ley 39/2015, art. 30: counting starts the day after
publication; business days (hábiles) skip Saturdays, Sundays and holidays; a
period in calendar days or months that ends on a non-business day moves to the
next business day; a month ends on the same day number, or on the month's last
day when that day does not exist. Holidays are the national and Andalusian
ones; local holidays vary by municipality and are not counted, so a deadline
can fall a day or two early.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

import holidays

Unit = Literal["habiles", "naturales", "meses"]

_NUMBERS = {
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cinco": 5, "diez": 10, "quince": 15, "veinte": 20,
    "treinta": 30, "cuarenta": 40, "cuarenta y cinco": 45, "sesenta": 60, "noventa": 90,
}
_WORD = "|".join(sorted((re.escape(w) for w in _NUMBERS), key=len, reverse=True))
# "plazo de treinta (30) días hábiles", "durante 30 días hábiles", "plazo de un mes".
_KEYWORD = re.compile(r"\b(?:plazo|periodo|período|durante)\b", re.IGNORECASE)
_PERIOD = re.compile(
    rf"\b(?:plazo|periodo|período|durante)\b[^.;]{{0,80}}?\b(?P<word>{_WORD})?\s*(?:\(?\s*(?P<digits>\d{{1,3}})\s*\)?)?\s*"
    r"(?P<unit>d[ií]as?|mes(?:es)?)\b(?P<kind>\s+(?:h[aá]biles|naturales))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Period:
    amount: int
    unit: Unit
    evidence: str


def parse_period(text: str) -> Period | None:
    """The first objection period stated in a notice, or None when it states none."""
    flat = re.sub(r"\s+", " ", text)
    for m in _PERIOD.finditer(flat):
        # A resolution's appeal period ("recurso de alzada ... en el plazo de
        # un mes") is not an objection period.
        sentence = flat[flat.rfind(".", 0, m.start()) + 1 : m.end()]
        if "recurso" in sentence.lower():
            continue
        if m.group("digits"):
            amount = int(m.group("digits"))
        elif m.group("word"):
            amount = _NUMBERS[m.group("word").lower()]
        else:
            continue
        if m.group("unit").lower().startswith("mes"):
            unit: Unit = "meses"
        else:
            # Days with no kind are business days (Ley 39/2015, art. 30.2).
            kind = (m.group("kind") or "").strip().lower()
            unit = "naturales" if kind == "naturales" else "habiles"
        # The evidence starts at the keyword nearest the figure: "plazo de
        # treinta (30) días hábiles", not "periodo de información pública durante el plazo...".
        phrase = m.group(0)
        start = max(k.start() for k in _KEYWORD.finditer(phrase))
        return Period(amount, unit, phrase[start:].strip())
    return None


def _holidays(years: range) -> holidays.HolidayBase:
    return holidays.Spain(subdiv="AN", years=list(years))


def _business(day: date, closed: holidays.HolidayBase) -> bool:
    return day.weekday() < 5 and day not in closed


def deadline(published: date, period: Period) -> date:
    """Last day to file an objection, without local holidays."""
    closed = _holidays(range(published.year, published.year + 2))
    if period.unit == "habiles":
        day, left = published, period.amount
        while left:
            day += timedelta(days=1)
            if _business(day, closed):
                left -= 1
        return day
    if period.unit == "naturales":
        day = published + timedelta(days=period.amount)
    else:
        month = published.month - 1 + period.amount
        year, month = published.year + month // 12, month % 12 + 1
        day = date(year, month, min(published.day, calendar.monthrange(year, month)[1]))
    while not _business(day, closed):
        day += timedelta(days=1)
    return day
