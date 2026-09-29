from simeon.kit.math import round_half_away_from_zero


def test_round_half_away_from_zero() -> None:
    assert round_half_away_from_zero(0) == 0
    assert round_half_away_from_zero(0.1) == 0.0
    assert round_half_away_from_zero(0.3) == 0.0
    assert round_half_away_from_zero(0.5) == 1.0
    assert round_half_away_from_zero(0.6) == 1.0
    assert round_half_away_from_zero(0.8) == 1.0
    assert round_half_away_from_zero(1.0) == 1.0
    assert round_half_away_from_zero(1.2) == 1.0
    assert round_half_away_from_zero(1.5) == 2.0
    assert round_half_away_from_zero(1.7) == 2.0
    assert round_half_away_from_zero(101.2) == 101.0
    assert round_half_away_from_zero(232.49) == 232.0
    assert round_half_away_from_zero(232.5) == 233.0
    assert round_half_away_from_zero(232.51) == 233.0
    assert round_half_away_from_zero(111111111.0) == 111111111.0

    assert round_half_away_from_zero(-0) == -0
    assert round_half_away_from_zero(-0.1) == 0.0
    assert round_half_away_from_zero(-0.3) == 0.0
    assert round_half_away_from_zero(-0.5) == -1.0
    assert round_half_away_from_zero(-0.6) == -1.0
    assert round_half_away_from_zero(-0.8) == -1.0
    assert round_half_away_from_zero(-1.0) == -1.0
    assert round_half_away_from_zero(-1.2) == -1.0
    assert round_half_away_from_zero(-1.5) == -2.0
    assert round_half_away_from_zero(-1.7) == -2.0
    assert round_half_away_from_zero(-111) == -111
    assert round_half_away_from_zero(-111.0) == -111.0
    assert round_half_away_from_zero(-232.2) == -232.0
    assert round_half_away_from_zero(-232.49) == -232.0
    assert round_half_away_from_zero(-232.5) == -233.0
    assert round_half_away_from_zero(-232.51) == -233.0
    assert round_half_away_from_zero(-111111111.0) == -111111111.0
