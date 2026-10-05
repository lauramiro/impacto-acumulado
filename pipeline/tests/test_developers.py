import pytest

from impacto.developers import (
    Group,
    build_developers,
    developer_key,
    family_key,
    group_of,
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


def test_the_shipped_groups_file_parses_and_every_parent_has_a_source():
    groups = load_groups()
    three = developer_key("Greenalia Solar PowerGuadame III, S.L.")
    one = developer_key("Greenalia Solar Power Guadame I, S.L.")
    assert group_of(three, groups) == group_of(one, groups)
    for g in groups.values():
        if g.parent_company:
            assert g.source_url and g.source_url.startswith("https://")


def test_a_corporate_row_reaches_spellings_joined_to_its_family():
    groups = {
        "acme-solar-powernorte": Group("Acme Solar Power Norte", None, None),
        "acme-solar-power-norte": Group("Acme", "Acme, S.A.", "https://example.org/acme"),
    }
    assert group_of("acme-solar-powernorte-3", groups).parent_company == "Acme, S.A."
    assert group_of("acme-solar-power-norte-1", groups).parent_company == "Acme, S.A."
    # A spelling row alone still names the spelling group.
    spelling = {"acme-solar-powernorte": groups["acme-solar-powernorte"]}
    assert group_of("acme-solar-powernorte-3", spelling).name == "Acme Solar Power Norte"
    assert group_of("otra", groups) is None


def test_a_parent_without_a_source_or_a_repeated_key_is_refused(tmp_path):
    path = tmp_path / "groups.csv"
    path.write_text(
        "key,group,parent_company,source_url,note\ntayant-investment,Grupo T,Matriz SA,,\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="without a source_url"):
        load_groups(path)
    path.write_text(
        "key,group,parent_company,source_url,note\nmitra-alfa,Mitra Alfa,,,\nmitra-alfa,Otro,,,\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="written twice"):
        load_groups(path)


def test_shipped_corporate_groups_roll_up_their_companies():
    groups = load_groups()
    devs = build_developers(
        [
            {"id": 1, "developer": "Greenalia Solar PowerGuadame III, S.L.U.", "status": "favorable", "mw_best": 49.99},
            {"id": 2, "developer": "Greenalia Solar Power Zumajo I, S.L.U.", "status": "favorable", "mw_best": 49.99},
            {"id": 3, "developer": "Enel Green Power España, SL", "status": "favorable", "mw_best": 10},
            {"id": 4, "developer": "Tayant Investment 12, S.L.", "status": "favorable", "mw_best": 49.8},
        ],
        groups,
    )
    by_key = {d["key"]: d for d in devs}
    assert {by_key[k]["group"] for k in ("greenalia-solar-powerguadame-iii", "greenalia-solar-power-zumajo-i")} == {
        "Greenalia"
    }
    # The corporate row does not merge the families: Guadame and Zumajo stay two naming patterns.
    assert by_key["greenalia-solar-powerguadame-iii"]["family"] == "greenalia-solar-power-guadame"
    assert by_key["greenalia-solar-power-zumajo-i"]["family"] == "greenalia-solar-power-zumajo"
    assert by_key["enel-green-power-espana"]["parent_company"] == "Endesa, S.A."
    assert by_key["enel-green-power-espana"]["source_url"].startswith("https://www.endesa.com/")
    # No source, no parent.
    assert by_key["tayant-investment-12"]["parent_company"] is None
    assert by_key["tayant-investment-12"]["group"] is None


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
