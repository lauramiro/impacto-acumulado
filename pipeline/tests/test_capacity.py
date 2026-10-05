from impacto.extract.capacity import labelled_capacity, with_capacity


def test_a_title_pair_gives_both_figures():
    found = labelled_capacity(
        'Resolución ... del proyecto parque solar fotovoltaico "Campos del Condado VI" de 61,2 MWP/51 MWN, y su infraestructura'
    )
    assert (found.peak, found.nominal) == (61.2, 51.0)
    assert labelled_capacity("Planta Campos del Condado VI de 51 MWnom").nominal == 51.0


def test_the_body_gives_the_nominal_beside_the_titles_peak():
    title = 'declaración de impacto ambiental del proyecto "Instalación fotovoltaica Las Quinientas de 109,52 MWp en Jerez"'
    body = "La potencia total instalada en la planta fotovoltaica será de 109,52 MWp (90,75 MWn), de los cuales: ... inversor de 3,63 MWn"
    found = labelled_capacity(title, body)
    assert (found.peak, found.nominal) == (109.52, 90.75)


def test_a_worded_pair_in_the_body():
    body = "construcción de una PSF con una potencia pico de 199,976 Mwp, una potencia nominal de 160 MW. La línea"
    found = labelled_capacity("Resolución ... para el proyecto que se cita", body)
    assert (found.peak, found.nominal) == (199.976, 160.0)


def test_several_plants_are_left_to_the_model():
    assert labelled_capacity(
        "Plantas fotovoltaicas Metaway I 116,5 MWp y Metaway II 116,5 MWp"
    ) == labelled_capacity("")
    assert labelled_capacity("FV Metaway I 116,5 MWp y Metaway II 116,5 MWp").peak is None
    assert (
        labelled_capacity(
            "Parque eólico Filabres, 153 MW, parque eólico Peregiles, 93 MW, y del parque solar La Rambla, 100 MWp"
        ).peak
        is None
    )
    assert labelled_capacity("Baluma Solar y Boyante Solar, de 62,5 MWp cada uno").peak is None


def test_a_body_with_two_pairs_is_left_to_the_model():
    body = "planta A de 50 MWp/40 MWn y planta B de 60 MWp/45 MWn"
    assert labelled_capacity("Anuncio del proyecto que se cita", body).nominal is None


def test_with_capacity_clears_a_peak_read_as_nominal_and_flags_what_it_read():
    payload = {"mw_nominal": 26.57, "mw_peak": 26.57}
    out = with_capacity(
        payload, "Planta fotovoltaica hibridación Alijar, de 26,57 MWp, y su infraestructura"
    )
    assert out["mw_nominal"] is None and out["mw_peak"] == 26.57
    assert out["mw_peak_labelled"] and "mw_nominal_labelled" not in out
    # Nothing labelled: the payload is returned as it was.
    assert with_capacity(payload, "Parque eólico Hinojosa, de 63,08 MW") is payload
