from impacto.text import normalize, strip_accents, tokens


def test_strip_accents():
    assert strip_accents("Málaga Córdoba Jaén Almería") == "Malaga Cordoba Jaen Almeria"


def test_normalize_lowercases_and_collapses_whitespace():
    assert normalize("  Parque   Fotovoltaico  RONDA I ") == "parque fotovoltaico ronda i"


def test_tokens_drops_punctuation():
    assert tokens("Ronda I, Ronda II (Cádiz)") == ["ronda", "i", "ronda", "ii", "cadiz"]
