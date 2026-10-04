from datetime import date

from impacto.consultations import Period, deadline, parse_period


def test_parse_period_reads_the_stock_phrases():
    assert parse_period("se abre un periodo de información pública durante el plazo de treinta (30) días hábiles, a contar") == Period(
        30, "habiles", "plazo de treinta (30) días hábiles"
    )
    assert parse_period("durante el plazo de 30 días hábiles desde el día siguiente") == Period(30, "habiles", "plazo de 30 días hábiles")
    assert parse_period("Durante 30 días hábiles los interesados").unit == "habiles"
    assert parse_period("durante el plazo de cuarenta y cinco (45) días hábiles").amount == 45
    assert parse_period("en el plazo de un mes a contar desde") == Period(1, "meses", "plazo de un mes")
    assert parse_period("durante el plazo de veinte días naturales") == Period(20, "naturales", "plazo de veinte días naturales")


def test_days_with_no_kind_are_business_days():
    assert parse_period("durante el plazo de treinta días, contados").unit == "habiles"


def test_no_period_stated_gives_none():
    # Office hours mention "días festivos" but state no period.
    assert parse_period("en horario de 9:00 a 14:00, de lunes a viernes, salvo días festivos. Cuarto. Las alegaciones") is None
    assert parse_period("se hace público el informe vinculante de 18 de octubre de 2022") is None


def test_business_days_skip_weekends_and_andalusian_holidays():
    # Published Friday 2026-07-24; 30 business days from Monday 27 July,
    # skipping Assumption Day (Saturday 15 August, already a weekend).
    assert deadline(date(2026, 7, 24), Period(30, "habiles", "")) == date(2026, 9, 4)
    # Published Friday 2026-03-20: 23 March to 1 April are 8 business days, Maundy
    # Thursday and Good Friday (2 and 3 April) are skipped, then 6 and 7 April.
    assert deadline(date(2026, 3, 20), Period(10, "habiles", "")) == date(2026, 4, 7)


def test_calendar_days_and_months_move_off_a_closed_day():
    # 20 calendar days from Friday 2026-09-18 is Thursday 8 October.
    assert deadline(date(2026, 9, 18), Period(20, "naturales", "")) == date(2026, 10, 8)
    # One month from 2026-09-12 is Monday 12 October, Spain's National Day: moves to Tuesday 13.
    assert deadline(date(2026, 9, 12), Period(1, "meses", "")) == date(2026, 10, 13)
    # 31 January plus one month ends on the last day of February (Saturday 28 in 2026), moved to Monday 2 March.
    assert deadline(date(2026, 1, 31), Period(1, "meses", "")) == date(2026, 3, 2)


def test_an_appeal_period_is_not_an_objection_period():
    resolution = (
        "Contra esta resolución, que no pone fin a la vía administrativa, podrá interponer recurso de alzada ante la persona "
        "titular de la Consejería, en el plazo de un mes, a contar a partir del día siguiente al de la recepción de la notificación."
    )
    assert parse_period(resolution) is None
    assert parse_period(resolution + " Se abre información pública durante el plazo de 30 días hábiles.").amount == 30
