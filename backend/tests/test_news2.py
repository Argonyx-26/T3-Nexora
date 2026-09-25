import pytest

from app.risk.news2 import (
    news2,
    score_consciousness,
    score_hr,
    score_rr,
    score_sbp,
    score_spo2_scale1,
    score_spo2_scale2,
    score_temp,
)
from app.risk.qsofa import qsofa

from .factories import reading


@pytest.mark.parametrize("rr,expected", [(8, 3), (9, 1), (11, 1), (12, 0), (20, 0), (21, 2), (24, 2), (25, 3), (40, 3)])
def test_respiratory_rate(rr, expected):
    assert score_rr(rr) == expected


@pytest.mark.parametrize("spo2,expected", [(85, 3), (91, 3), (92, 2), (93, 2), (94, 1), (95, 1), (96, 0), (100, 0)])
def test_spo2_scale1(spo2, expected):
    assert score_spo2_scale1(spo2) == expected


@pytest.mark.parametrize(
    "spo2,on_o2,expected",
    [(83, False, 3), (84, False, 2), (85, False, 2), (86, False, 1), (87, False, 1), (88, False, 0), (92, False, 0),
     (96, False, 0), (93, True, 1), (94, True, 1), (95, True, 2), (96, True, 2), (97, True, 3)],
)
def test_spo2_scale2(spo2, on_o2, expected):
    assert score_spo2_scale2(spo2, on_o2) == expected


@pytest.mark.parametrize(
    "temp,expected",
    [(34.0, 3), (35.0, 3), (35.1, 1), (36.0, 1), (36.1, 0), (38.0, 0), (38.1, 1), (39.0, 1), (39.1, 2), (41.0, 2)],
)
def test_temperature(temp, expected):
    assert score_temp(temp) == expected


@pytest.mark.parametrize(
    "sbp,expected", [(80, 3), (90, 3), (91, 2), (100, 2), (101, 1), (110, 1), (111, 0), (219, 0), (220, 3)]
)
def test_systolic_bp(sbp, expected):
    assert score_sbp(sbp) == expected


@pytest.mark.parametrize(
    "hr,expected", [(35, 3), (40, 3), (41, 1), (50, 1), (51, 0), (90, 0), (91, 1), (110, 1), (111, 2), (130, 2), (131, 3)]
)
def test_heart_rate(hr, expected):
    assert score_hr(hr) == expected


@pytest.mark.parametrize("level,expected", [("A", 0), ("C", 3), ("V", 3), ("P", 3), ("U", 3)])
def test_consciousness(level, expected):
    assert score_consciousness(level) == expected


def test_values_are_rounded_as_charted():
    assert score_spo2_scale1(95.4) == 1  # charted as 95
    assert score_spo2_scale1(95.5) == 0  # charted as 96
    assert score_temp(38.04) == 0  # charted as 38.0


def test_all_normal_is_zero_low():
    r = news2(reading())
    assert r.total == 0
    assert r.band == "Low"


def test_single_three_is_low_medium():
    r = news2(reading(rr=26))
    assert r.total == 3
    assert r.band == "Low-Medium"


def test_band_boundaries():
    assert news2(reading(rr=22, spo2=95, hr=95)).total == 4  # 2 + 1 + 1
    assert news2(reading(rr=22, spo2=95, hr=95)).band == "Low"
    assert news2(reading(rr=22, spo2=93, hr=95)).band == "Medium"  # 2 + 2 + 1 = 5
    assert news2(reading(rr=22, spo2=93, hr=115)).total == 6
    assert news2(reading(rr=22, spo2=93, hr=115)).band == "Medium"
    assert news2(reading(rr=22, spo2=93, hr=115, temp=38.5)).total == 7
    assert news2(reading(rr=22, spo2=93, hr=115, temp=38.5)).band == "High"


def test_supplemental_oxygen_adds_two():
    assert news2(reading(on_oxygen=True)).parameters["oxygen"] == 2
    assert news2(reading(on_oxygen=True)).total == 2


def test_scale2_spares_copd_target_range():
    copd = reading(spo2=89)
    assert news2(copd, spo2_scale=1).parameters["spo2"] == 3
    assert news2(copd, spo2_scale=2).parameters["spo2"] == 0


def test_qsofa():
    assert not qsofa(reading()).flag
    assert qsofa(reading(rr=22)).score == 1
    both = qsofa(reading(rr=24, sbp=98))
    assert both.score == 2 and both.flag
    assert qsofa(reading(rr=24), altered_mentation=True).flag
    assert qsofa(reading(consciousness="C", sbp=95)).flag
