from impacto.privacy import strip_personal_annex

HEAD = "Anuncio del Área de Industria y Energía por el que se somete a información pública la solicitud de autorización administrativa previa y el estudio de impacto ambiental del parque eólico X."
ANNEX = "Relación concreta e individualizada de bienes y derechos afectados. Finca 1. Titular: Persona Ejemplo. Polígono 4, parcela 12."


def test_cuts_the_owner_list_and_everything_after_it():
    result = strip_personal_annex(f"{HEAD}\nDurante el plazo de treinta días.\n{ANNEX}\nOtra finca más.")
    assert result.text == f"{HEAD}\nDurante el plazo de treinta días."
    assert result.removed_chars > 0 and not result.held_back


def test_keeps_a_text_with_no_annex_whole():
    result = strip_personal_annex(HEAD)
    assert (result.text, result.removed_chars, result.held_back) == (HEAD, 0, False)


def test_holds_back_a_text_where_identity_numbers_survive_the_cut():
    for leftover in ("Alegaciones de 12345678Z.", "Titular: X1234567L.", "Con DNI ***4567**."):
        result = strip_personal_annex(f"{HEAD}\n{leftover}")
        assert result.held_back, leftover
        assert result.reason


def test_an_owner_list_that_starts_mid_paragraph_is_cut_too():
    result = strip_personal_annex(f"{HEAD} Anexo: relación de bienes y derechos afectados: Titular: Persona Ejemplo.")
    assert "Titular" not in result.text and not result.held_back


def test_the_cut_lands_in_the_right_place_after_characters_that_fold_differently():
    text = f"Oﬁcina de İnformación. {HEAD}\n{ANNEX}"
    assert strip_personal_annex(text).text == f"Oﬁcina de İnformación. {HEAD}"
