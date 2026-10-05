from impacto.developers import (
    Group,
    build_developers,
    developer_key,
    family_key,
    load_groups,
    resolved_family,
    split_names,
)


def test_legal_forms_case_accents_and_punctuation_share_a_key():
    names = [
        "Enel Green Power España, S.L.",
        "Enel Green Power España, SL",
        "ENEL GREEN POWER ESPAÑA S.L.U.",
        "Enel Green Power España, Sociedad Limitada",
    ]
    assert {developer_key(n) for n in names} == {"enel-green-power-espana"}
    assert developer_key("Al-Andalus Wind Power, S. L.") == developer_key(
        "AL ANDALUS WIND POWER, S.L.U."
    )
    assert developer_key("Iberdrola Renovables Andalucía, SA") == developer_key(
        "IBERDROLA RENOVABLES ANDALUCIA S.A.U."
    )
    assert developer_key("Tabernas 400 Renovables, A.I.E.") == "tabernas-400-renovables"


def test_digits_glued_to_letters_and_parentheses():
    assert developer_key("Alpha1 Conexión Solar, S.L.") == developer_key(
        "Alpha 1 Conexión Solar, S.L."
    )
    assert developer_key("Bogaris PV22, S.L.U.") == "bogaris-pv-22"
    assert developer_key(
        "Sociedad Mercantil Estatal de Infraestructuras Agrarias S.A. (SEIASA)"
    ) == ("sociedad-mercantil-estatal-de-infraestructuras-agrarias")


def test_a_name_inside_another_word_is_not_a_legal_form():
    assert developer_key("Mesa Solar, S.L.") == "mesa-solar"
    assert developer_key("Acuamed") == "acuamed"


def test_family_drops_a_trailing_number_roman_numeral_or_number_word():
    assert family_key(developer_key("Tayant Investment 12, S.L.")) == family_key(
        developer_key("Tayant Investment 15, S.L.")
    )
    assert family_key("greenalia-solar-power-guadame-iii") == "greenalia-solar-power-guadame"
    assert family_key("global-solar-energy-dieciseis") == "global-solar-energy"
    assert family_key("psfv-puerto-two") == "psfv-puerto"
    assert family_key("olivento") == "olivento"
    # A number inside the name stays; a name that is only a number keeps it.
    assert family_key("granada-133-solar") == "granada-133-solar"
    assert family_key("arco-6") == "arco"
    assert family_key("vi") == "vi"


def test_split_names_reads_several_companies():
    assert split_names("Amura Solar, S.L.; Trofeo Solar, S.L.") == [
        "Amura Solar, S.L.",
        "Trofeo Solar, S.L.",
    ]
    assert split_names(None) == []
    assert split_names("  ") == []


def test_groups_apply_to_a_key_or_its_family(tmp_path):
    path = tmp_path / "groups.csv"
    path.write_text(
        "key,group,parent_company,source_url,note\n"
        "siroco-hydrogene,Siroco Hydrogen,,,slip\n"
        "tayant-investment,Grupo T,Matriz SA,https://example.org,\n",
        encoding="utf-8",
    )
    groups = load_groups(path)
    assert groups["tayant-investment"] == Group("Grupo T", "Matriz SA", "https://example.org")
    devs = build_developers(
        [
            {
                "id": 1,
                "developer": "Siroco Hydrogene 4, S.L.",
                "status": "en_consulta",
                "mw_best": None,
            },
            {
                "id": 2,
                "developer": "Tayant Investment 12, S.L.",
                "status": "favorable",
                "mw_best": 49.8,
            },
        ],
        groups,
    )
    by_key = {d["key"]: d for d in devs}
    # siroco-hydrogene-4 has family siroco-hydrogene, which the file names.
    assert by_key["siroco-hydrogene-4"]["group"] == "Siroco Hydrogen"
    assert by_key["tayant-investment-12"]["parent_company"] == "Matriz SA"
    assert by_key["tayant-investment-12"]["mw_by_status"] == {"favorable": 49.8}
    assert by_key["siroco-hydrogene-4"]["mw_count"] == 0


def test_the_display_name_is_the_most_printed_and_not_shouted():
    devs = build_developers(
        [
            {"id": 1, "developer": "OLIVENTO, S.L.", "status": "favorable", "mw_best": 1},
            {"id": 2, "developer": "Olivento S.L.", "status": "favorable", "mw_best": 1},
        ],
        {},
    )
    assert devs[0]["name"] == "Olivento S.L."


def test_the_shipped_groups_file_parses():
    groups = load_groups()
    assert (
        groups["greenalia-solar-powerguadame"].name == groups["greenalia-solar-power-guadame"].name
    )


def test_a_spelling_row_joins_families_and_a_corporate_row_does_not():
    groups = load_groups()
    three = developer_key("Greenalia Solar PowerGuadame III, S.L.")
    five = developer_key("Greenalia Solar Power Guadame V, S.L.")
    assert family_key(three) != family_key(five)
    assert resolved_family(three, groups) == resolved_family(five, groups)
    assert resolved_family(five, groups) == "greenalia-solar-power-guadame"
    corporate = {"tayant-investment": Group("Grupo T", "Matriz SA", None)}
    assert resolved_family("tayant-investment-12", corporate) == "tayant-investment"
    assert resolved_family("olivento", {}) == "olivento"
    devs = build_developers(
        [
            {"id": 1, "developer": "Greenalia Solar PowerGuadame III, S.L.", "status": "favorable", "mw_best": 49.99},
            {"id": 2, "developer": "Greenalia Solar Power Guadame V, S.L.", "status": "favorable", "mw_best": 49.99},
        ],
        groups,
    )
    assert {d["family"] for d in devs} == {"greenalia-solar-power-guadame"}
