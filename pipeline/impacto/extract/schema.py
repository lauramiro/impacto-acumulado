from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DocType = Literal[
    "dia", "informe_impacto", "aau", "informacion_publica", "modificacion", "caducidad", "otro"
]
Verdict = Literal["favorable", "favorable_condicionada", "desfavorable", "no_aplica"]
Technology = Literal["solar_fv", "eolica", "hibrida", "almacenamiento", "linea_evacuacion", "otra"]
ConditionCategory = Literal[
    "fauna", "flora", "agua", "suelo", "paisaje", "patrimonio", "vigilancia", "compensacion", "general"
]


class Municipality(BaseModel):
    name: str
    province: str | None = None


class Condition(BaseModel):
    category: ConditionCategory = "general"
    text: str


class UtmCoordinate(BaseModel):
    x: float
    y: float
    zone: int | None = None


class Extraction(BaseModel):
    doc_type: DocType
    verdict: Verdict
    project_name: str | None = None
    developer: str | None = None
    expediente: str | None = None
    technology: Technology | None = None
    mw_peak: float | None = None
    mw_nominal: float | None = None
    hectares: float | None = None
    turbines: int | None = None
    municipalities: list[Municipality] = Field(default_factory=list)
    utm_coordinates: list[UtmCoordinate] = Field(default_factory=list)
    protected_areas_mentioned: list[str] = Field(default_factory=list)
    species_mentioned: list[str] = Field(default_factory=list)
    conditions: list[Condition] = Field(default_factory=list)
    related_projects: list[str] = Field(default_factory=list)
    evidence: dict[str, str] = Field(default_factory=dict)
    confidence: float = 0.0

    def merge(self, other: Extraction) -> Extraction:
        data = self.model_dump()
        for key, value in other.model_dump().items():
            if key in ("doc_type", "verdict", "confidence"):
                continue
            current = data.get(key)
            # Only a genuinely empty value (None, [], {}) counts as "not yet
            # filled". A real 0 / 0.0 is a legitimate answer (e.g. turbines=0
            # for a solar-only project) and must not be overwritten by a
            # later section's non-zero value for a different field.
            if current in (None, [], {}) and value not in (None, [], {}):
                data[key] = value
            elif key == "evidence":
                data[key] = {**value, **current}
        data["confidence"] = max(self.confidence, other.confidence)
        return Extraction.model_validate(data)
