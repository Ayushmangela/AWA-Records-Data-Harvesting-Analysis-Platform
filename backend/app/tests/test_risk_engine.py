import datetime
from unittest.mock import patch
from app.services.risk_engine import cutoff_18_months_ago

def test_18_months_cutoff_is_calendar_correct():
    # Mock today's date
    mock_today = datetime.date(2026, 5, 28)
    expected = datetime.date(2024, 11, 28)
    
    with patch('app.services.risk_engine.date') as mock_date:
        mock_date.today.return_value = mock_today
        result = cutoff_18_months_ago()
        
    assert result == expected, f"Expected {expected}, got {result}"

    # Also test a leap year boundary
    mock_today = datetime.date(2024, 2, 29)
    expected = datetime.date(2022, 8, 29)
    with patch('app.services.risk_engine.date') as mock_date:
        mock_date.today.return_value = mock_today
        result = cutoff_18_months_ago()
        
    assert result == expected, f"Expected {expected}, got {result}"
