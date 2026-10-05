from impacto.privacy import strip_personal_annex

HEAD = "Anuncio del Área de Industria y Energía por el que se somete a información pública la solicitud de autorización administrativa previa y el estudio de impacto ambiental del parque eólico X."
ANNEX = "Relación concreta e individualizada de bienes y derechos afectados"
ROW = "Finca 1. Titular: Persona Ejemplo. Polígono 4, parcela 12."


def test_cuts_the_owner_list_and_everything_after_it():
    result = strip_personal_annex(f"{HEAD}\nDurante el plazo de treinta días.\n{ANNEX}\n{ROW}\nOtra finca más.")
    assert result.text == f"{HEAD}\nDurante el plazo de treinta días."
    assert result.removed_chars > 0 and not result.held_back


def test_a_mention_of_the_list_in_passing_is_kept_with_what_follows_it():
    # Public-utility notices refer to the annex before stating the period.
    body = f"{HEAD}\nSe acompaña la relación de bienes y derechos afectados que figura como anexo.\nDurante el plazo de treinta días podrán presentarse alegaciones."
    result = strip_personal_annex(f"{body}\nANEXO\n{ANNEX}\n{ROW}")
    assert result.text == body and not result.held_back


def test_owner_rows_without_a_heading_are_cut_from_the_first_row():
    result = strip_personal_annex(f"{HEAD}\nDurante el plazo de treinta días.\n{ROW}\nFinca 2. Titular: Otra Persona.")
    assert result.text == f"{HEAD}\nDurante el plazo de treinta días."


def test_keeps_a_text_with_no_annex_whole():
    result = strip_personal_annex(HEAD)
    assert (result.text, result.removed_chars, result.held_back) == (HEAD, 0, False)


def test_holds_back_a_text_where_identity_numbers_survive_the_cut():
    for leftover in ("Alegaciones de 12345678Z.", "Con DNI ***4567**."):
        result = strip_personal_annex(f"{HEAD} {leftover}")
        assert result.held_back, leftover
        assert result.reason


def test_the_cut_lands_in_the_right_place_after_characters_that_fold_differently():
    text = f"Oﬁcina de İnformación. {HEAD}\n{ANNEX}\n{ROW}"
    assert strip_personal_annex(text).text == f"Oﬁcina de İnformación. {HEAD}"
