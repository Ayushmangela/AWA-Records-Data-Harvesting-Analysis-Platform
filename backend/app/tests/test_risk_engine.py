import datetime
from unittest.mock import patch

from app.services.risk_engine import cutoff_18_months_ago


def test_18_months_cutoff_is_calendar_correct():
    # Mock today's date
    mock_now = datetime.datetime(2026, 5, 28, tzinfo=datetime.timezone.utc)
    expected = datetime.date(2024, 11, 28)

    with patch("app.services.risk_engine.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_now
        result = cutoff_18_months_ago()

    assert result == expected, f"Expected {expected}, got {result}"

    # Also test a leap year boundary
    mock_now = datetime.datetime(2024, 2, 29, tzinfo=datetime.timezone.utc)
    expected = datetime.date(2022, 8, 29)
    with patch("app.services.risk_engine.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_now
        result = cutoff_18_months_ago()

    assert result == expected, f"Expected {expected}, got {result}"
