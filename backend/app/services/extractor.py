import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List

import spacy

from app.services.wordlist import TOP_1000_WORDS

logger = logging.getLogger(__name__)

try:
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    logger.warning("Failed to load spaCy model: %s", e)
    nlp = None


def _parse_extracted_date(date_str: str | None) -> Any:
    if not date_str:
        return None
    # E.g., 12-DEC-2023 or 2023-12-12
    for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
        try:
            parsed_dt = datetime.strptime(date_str, fmt)  # noqa: DTZ007
            return parsed_dt.replace(tzinfo=timezone.utc).date()
        except ValueError:
            continue
    return date_str


def extract_data(text: str, filename: str) -> Dict[str, Any]:
    """
    Extract structured USDA APHIS information from raw PDF text.

    Returns a dictionary with:
    - facility: dict with name, customer_id, certificate_number, city, state
    - inspection: dict with inspection_date, inspector_name, inspector_id,
      violations_found, violation_count
    - violations: list of dicts with severity, section, description
    - inventory: list of dicts with count, scientific_name, common_name
    - source_pdf: filename
    """
    # Initialize default results
    facility = {
        "name": None,
        "customer_id": None,
        "certificate_number": None,
        "city": None,
        "state": None,
    }

    inspection = {
        "inspection_date": None,
        "inspector_name": None,
        "inspector_id": None,
        "violations_found": False,
        "violation_count": 0,
    }

    violations: List[Dict[str, Any]] = []
    inventory: List[Dict[str, Any]] = []

    # --- 1. Regex Extraction ---

    # certificate_number: pattern \d{2}-[A-Z]-\d{4}
    cert_match = re.search(r"\b\d{2}-[A-Z]-\d{4}\b", text)
    if cert_match:
        facility["certificate_number"] = cert_match.group(0)

    # inspection_date: pattern \d{2}-[A-Z]{3}-\d{4}
    date_match = re.search(r"\b\d{2}-[A-Z]{3}-\d{4}\b", text)
    if date_match:
        inspection["inspection_date"] = _parse_extracted_date(date_match.group(0))

    # customer_id: number after 'Customer ID:'
    cust_match = re.search(r"Customer\s*ID:\s*(\d+)", text, re.IGNORECASE)
    if cust_match:
        facility["customer_id"] = cust_match.group(1)

    # inspector_id: all caps code like EPANNILL, rejecting common dictionary words
    inspector_id = None
    for insp_id_match in re.finditer(
        r"(?:Inspector|Prepared\s+By)\s*(?:Name|ID)?:\s*([A-Z][A-Z0-9]{5,11})", text, re.IGNORECASE
    ):
        candidate_id = insp_id_match.group(1).upper()
        if candidate_id not in TOP_1000_WORDS:
            inspector_id = candidate_id
            break

    inspection["inspector_id"] = inspector_id

    # animal count: number before word 'Total'
    re.search(r"(\d+)\s+Total", text)
    # We can keep track of animal count if needed, but the main inventory list is built below

    # --- 2. spaCy Named Entity Recognition ---
    if nlp:
        doc = nlp(text)
        persons = [ent.text.strip() for ent in doc.ents if ent.label_ == "PERSON"]
        gpes = [ent.text.strip() for ent in doc.ents if ent.label_ == "GPE"]

        # Inspector name vs Owner name
        inspector_name = None
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                start_idx = max(0, ent.start_char - 50)
                end_idx = min(len(text), ent.end_char + 50)
                context = text[start_idx:end_idx].lower()
                if "inspector" in context:
                    inspector_name = ent.text.strip()
                    break

        inspection["inspector_name"] = inspector_name

        # First PERSON entity that is not the inspector is likely the owner
        for p in persons:
            if p != inspector_name:
                facility["name"] = p
                break

        # City and State from GPE entities
        for gpe in gpes:
            if len(gpe) == 2 and gpe.isupper():
                facility["state"] = gpe
            elif not facility["city"]:
                facility["city"] = gpe

    # --- 2.5 Robust Regex Fallbacks (essential for ALL-CAPS fields) ---
    if not inspection["inspector_name"]:
        # Match 'Prepared By: Name'
        insp_name_match = re.search(
            r"Prepared\s+By:\s*([A-Za-z\s,.-]+?)(?=\s+Date:|\s+Title:|\n|$)", text, re.IGNORECASE
        )
        if insp_name_match:
            inspection["inspector_name"] = insp_name_match.group(1).strip()

    if not facility["name"]:
        # Match 'Name Customer ID: 12345'
        owner_match = re.search(r"([A-Za-z0-9\s,.-]+?)\s*Customer\s*ID:", text, re.IGNORECASE)
        if owner_match:
            facility["name"] = owner_match.group(1).strip()

    if not facility["city"] or not facility["state"]:
        # Match 'City, ST 12345'
        city_state_match = re.search(r"\b([A-Za-z\s.-]+),\s*([A-Z]{2})\s+\d{5}\b", text)
        if city_state_match:
            if not facility["city"]:
                facility["city"] = city_state_match.group(1).strip()
            if not facility["state"]:
                facility["state"] = city_state_match.group(2).strip()

    # Address fallback for state (zip only)
    if not facility["state"]:
        state_match = re.search(r"\b([A-Z]{2})\s+\d{5}\b", text)
        if state_match:
            facility["state"] = state_match.group(1)

    # --- 3. Violation Extraction ---
    # Match section number, optional severity keyword, and title
    violation_pattern = r"(?:^|\n)(\d+\.\d+(?:\([a-zA-Z0-9]+\))*)(?:\s+(Direct|Critical|Repeat|Teachable|Indirect))?\s*\n([A-Z][A-Za-z0-9 \t,.:;()'&/-]+)(?=\n|$)"
    violation_matches = list(re.finditer(violation_pattern, text))

    for i, match in enumerate(violation_matches):
        section = match.group(1)
        sev_keyword = match.group(2)
        title = match.group(3).strip()

        if sev_keyword == "Repeat" or not sev_keyword:
            severity = "Indirect"
        else:
            severity = sev_keyword.capitalize()

        start_desc = match.end()
        end_desc = violation_matches[i + 1].start() if i + 1 < len(violation_matches) else len(text)

        # Stop at standard footer/header sections
        for keyword in ["species inspected", "prepared by", "customer:", "received by"]:
            stop_idx = text.lower().find(keyword, start_desc)
            if stop_idx != -1 and stop_idx < end_desc:
                end_desc = stop_idx

        description = text[start_desc:end_desc].strip()
        full_desc = f"{title}\n\n{description}" if description else title

        violations.append(
            {
                "severity": severity,
                "section": section,
                "description": full_desc,
            }
        )

    # --- 4. Inventory Extraction ---
    # Find pattern: number + scientific name + common name inside Species Inspected section
    species_section = ""
    idx = text.lower().find("species inspected")
    if idx != -1:
        end_idx = text.lower().find("total", idx)
        if end_idx == -1:
            end_idx = len(text)
        species_section = text[idx:end_idx]
    else:
        species_section = text

    inventory_pattern = (
        r"\b(\d+)\s+([A-Z][a-z]+(?:\s+[a-z]+){1,2})\s+([A-Z][A-Z\s,()-]+)(?=\n|\r|$)"
    )
    for match in re.finditer(inventory_pattern, species_section):
        count = int(match.group(1))
        sci_name = match.group(2).strip()
        common_name = match.group(3).strip()
        inventory.append(
            {
                "count": count,
                "scientific_name": sci_name,
                "common_name": common_name,
            }
        )

    # Set violations found and count on inspection
    inspection["violations_found"] = len(violations) > 0
    inspection["violation_count"] = len(violations)

    return {
        "facility": facility,
        "inspection": inspection,
        "violations": violations,
        "inventory": inventory,
        "source_pdf": filename,
    }
