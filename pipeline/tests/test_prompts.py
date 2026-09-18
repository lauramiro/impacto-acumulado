from impacto.extract.prompts import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt


def test_prompt_version_is_set():
    assert PROMPT_VERSION == "v1"


def test_system_prompt_lists_every_enum_value():
    for value in [
        "dia", "informe_impacto", "aau", "informacion_publica",
        "favorable_condicionada", "desfavorable", "solar_fv", "eolica",
    ]:
        assert value in SYSTEM_PROMPT


def test_system_prompt_explains_empty_conditions_are_valid():
    # Unfavourable resolutions often have no conditions block at all: the
    # model must know an empty list is the correct output, not an omission.
    normalized = SYSTEM_PROMPT.lower()
    assert "conditions" in normalized or "condicion" in normalized
    assert "vac" in normalized  # "vacia"/"vacío" - empty list is a valid answer


def test_system_prompt_explains_partial_refusal_verdict_rule():
    # A resolution that only refuses an accessory part (e.g. an evacuation
    # line) while authorising the project itself is favorable_condicionada,
    # not desfavorable. desfavorable is reserved for refusing the project.
    normalized = SYSTEM_PROMPT.lower()
    assert "evacuacion" in normalized
    assert "favorable_condicionada" in normalized
    assert "desfavorable" in normalized


def test_user_prompt_includes_section_title_and_text():
    p = build_user_prompt("conditions", "Condiciones al proyecto...", "Resolución X")
    assert "conditions" in p
    assert "Resolución X" in p
    assert "Condiciones al proyecto" in p
