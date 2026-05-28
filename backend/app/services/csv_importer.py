import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from app.database import SessionLocal
from app.models import Facility, Inspection, Violation

HASH_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def _clean(val):
    if pd.isna(val) or val is None:
        return None
    val_str = str(val).strip()
    if val_str == "" or val_str.lower() == "nan":
        return None
    if val_str.endswith(".0") and val_str[:-2].isdigit():
        val_str = val_str[:-2]
    return val_str


def _get_int(row, column) -> int:
    val = row.get(column, 0)
    if pd.isna(val) or val is None or val == "":
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def run_full_import():
    db = SessionLocal()
    start_time = time.time()

    csv_path = (
        Path(__file__).resolve().parent.parent.parent / "data" / "csv_exports" / "inspections.csv"
    )
    print(f"Reading CSV from {csv_path}...")

    df = pd.read_csv(csv_path)

    facility_cache = {}  # cert_num -> Facility

    # To speed up, load existing facilities if any
    existing_facilities = db.query(Facility).all()
    for f in existing_facilities:
        facility_cache[f.certificate_number] = f

    processed_count = 0
    imported_count = 0

    cutoff_dt = datetime.strptime("2021-01-01", "%Y-%m-%d")  # noqa: DTZ007
    cutoff_date = cutoff_dt.replace(tzinfo=timezone.utc).date()

    seen_hash_ids = set()
    seen_facility_dates = set()

    print("Starting import process...")
    for _idx, row in df.iterrows():
        processed_count += 1

        # Parse inspection date
        raw_date = row.get("pdf_date") or row.get("web_inspectionDate")
        if pd.isna(raw_date) or not raw_date:
            continue

        date_str = str(raw_date).strip()
        if not date_str or date_str.lower() in ("nan", "nat", ""):
            continue

        # Try formats
        insp_date = None
        for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%m/%d/%Y", "%Y/%m/%d"):
            try:
                parsed_dt = datetime.strptime(date_str, fmt)  # noqa: DTZ007
                insp_date = parsed_dt.replace(tzinfo=timezone.utc).date()
                break
            except ValueError:
                try:
                    parsed_dt = datetime.strptime(date_str[:10], fmt)  # noqa: DTZ007
                    insp_date = parsed_dt.replace(tzinfo=timezone.utc).date()
                    break
                except ValueError:
                    continue

        if not insp_date:
            continue

        if insp_date < cutoff_date:
            continue

        # Get or create Facility
        cert_num = _clean(row.get("pdf_certificate")) or _clean(row.get("web_certNumber"))
        if not cert_num:
            continue

        facility = facility_cache.get(cert_num)
        if not facility:
            cust_id = _clean(row.get("web_customerNumber"))
            if cust_id:
                # check unique constraint
                existing = db.query(Facility).filter(Facility.customer_id == cust_id).first()
                if existing and existing.certificate_number != cert_num:
                    cust_id = None

            name = (
                _clean(row.get("pdf_customer_name")) or _clean(row.get("web_legalName")) or cert_num
            )
            address = _clean(row.get("pdf_customer_addr"))
            city = _clean(row.get("web_city"))
            state = _clean(row.get("customer_state")) or _clean(row.get("web_state"))
            zip_code = _clean(row.get("web_zip"))
            license_type = _clean(row.get("licenseType")) or _clean(row.get("web_certType"))

            facility = Facility(
                name=name,
                customer_id=cust_id,
                certificate_number=cert_num,
                license_type=license_type,
                address=address,
                city=city,
                state=state,
                zip_code=zip_code,
                license_status="ACTIVE",
            )
            db.add(facility)
            db.flush()
            facility_cache[cert_num] = facility

        # Check duplicates
        hash_id = _clean(row.get("hash_id"))
        if hash_id and not HASH_RE.match(hash_id):
            print(f"Warning: Invalid hash_id '{hash_id}'. Skipping record.")
            continue

        source_pdf = _clean(row.get("web_reportLink"))

        if hash_id and hash_id in seen_hash_ids:
            continue
        if insp_date and (facility.id, insp_date) in seen_facility_dates:
            continue

        if hash_id:
            seen_hash_ids.add(hash_id)
        if insp_date:
            seen_facility_dates.add((facility.id, insp_date))

        # Create Inspection
        web_direct = _get_int(row, "web_direct")
        web_critical = _get_int(row, "web_critical")
        web_non_critical = _get_int(row, "web_nonCritical")
        web_teachable = _get_int(row, "web_teachableMoments")

        violations_found = (web_direct + web_critical) > 0
        violation_count = web_direct + web_critical + web_non_critical + web_teachable

        inspection = Inspection(
            facility_id=facility.id,
            inspection_date=insp_date,
            inspection_type=_clean(row.get("pdf_insp_type")),
            inspector_id=_clean(row.get("pdf_insp_id")),
            inspector_name=None,
            violations_found=violations_found,
            violation_count=violation_count,
            source_pdf=source_pdf,
            source_pdf_path=hash_id,
            source_type="CSV_IMPORT",
        )
        db.add(inspection)
        db.flush()

        # Create Violations
        violation_source = hash_id or source_pdf

        if web_direct > 0:
            db.add(
                Violation(
                    inspection_id=inspection.id,
                    severity="Direct",
                    section=None,
                    description=f"{web_direct} direct violations",
                    source_pdf=violation_source,
                )
            )

        if web_critical > 0:
            db.add(
                Violation(
                    inspection_id=inspection.id,
                    severity="Critical",
                    section=None,
                    description=f"{web_critical} critical violations",
                    source_pdf=violation_source,
                )
            )

        if web_non_critical > 0:
            db.add(
                Violation(
                    inspection_id=inspection.id,
                    severity="Indirect",
                    section=None,
                    description=f"{web_non_critical} non-critical violations",
                    source_pdf=violation_source,
                )
            )

        if web_teachable > 0:
            db.add(
                Violation(
                    inspection_id=inspection.id,
                    severity="Teachable",
                    section=None,
                    description=f"{web_teachable} teachable moments",
                    source_pdf=violation_source,
                )
            )

        imported_count += 1

        if imported_count % 500 == 0:
            db.commit()

        if processed_count % 2000 == 0:
            elapsed = int(time.time() - start_time)
            print(
                f"Imported {processed_count} records | "
                f"Facilities: {len(facility_cache)} | Time: {elapsed}s"
            )

    db.commit()
    db.close()

    elapsed = int(time.time() - start_time)
    print(
        f"Finished full import. Processed {processed_count} total rows, "
        f"imported {imported_count} inspections."
    )
    print(f"Time taken: {elapsed}s")


if __name__ == "__main__":
    run_full_import()
