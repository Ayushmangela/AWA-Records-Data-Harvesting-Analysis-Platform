import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Default config fallback in case of loading issues
rules = {
    "section_mappings": {},
    "section_prefix_mappings": {},
    "keyword_mappings": {}
}

# Try loading from the JSON configuration file
try:
    config_path = Path(__file__).resolve().parent / "category_rules.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            rules = json.load(f)
    else:
        logger.warning("category_rules.json not found at %s. Category mapping will be empty.", config_path)
except Exception as e:
    logger.error("Failed to load category_rules.json: %s", e)

SECTION_MAPPINGS = rules.get("section_mappings", {})
SECTION_PREFIX_MAPPINGS = rules.get("section_prefix_mappings", {})
KEYWORD_MAPPINGS = rules.get("keyword_mappings", {})

def map_section_to_category(section: str | None, description: str | None = "") -> str:
    """
    Map an AWA section code and violation description into a human-readable category:
    - Veterinary Care
    - Animal Welfare
    - Housing Facilities
    - Sanitation
    - Pest Control
    - Record Keeping
    - Research Oversight
    """
    sec = (section or "").strip()
    desc = (description or "").lower()

    # 1. Exact Section Code Match
    if sec in SECTION_MAPPINGS:
        return SECTION_MAPPINGS[sec]

    # 2. Check for Prefix match (e.g. section starts with 3.1)
    # We sort prefix keys by length descending to match the most specific prefix first
    for prefix in sorted(SECTION_PREFIX_MAPPINGS.keys(), key=len, reverse=True):
        if sec.startswith(prefix):
            return SECTION_PREFIX_MAPPINGS[prefix]

    # 3. Check for Keywords (priority matching)
    # Pest Control keyword matches are prioritized because they reside inside sanitation/housing sections
    for keyword in KEYWORD_MAPPINGS.get("Pest Control", []):
        if keyword in desc:
            return "Pest Control"

    # Sanitation keyword matches
    for keyword in KEYWORD_MAPPINGS.get("Sanitation", []):
        if keyword in desc:
            return "Sanitation"

    # Veterinary Care keyword fallback
    for keyword in KEYWORD_MAPPINGS.get("Veterinary Care", []):
        if keyword in desc:
            return "Veterinary Care"

    # Record Keeping keyword fallback
    for keyword in KEYWORD_MAPPINGS.get("Record Keeping", []):
        if keyword in desc:
            return "Record Keeping"

    # Research Oversight keyword fallback
    for keyword in KEYWORD_MAPPINGS.get("Research Oversight", []):
        if keyword in desc:
            return "Research Oversight"

    # 4. Fallback default
    return "Animal Welfare"
