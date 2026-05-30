import concurrent.futures
import json
import logging
import os
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from sqlalchemy import desc, func, or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import EnforcementAction, Facility, Inspection, ProcessingStatus
from app.services.pdf_utils import download_pdf_bytes, sha256_bytes, sha256_file
from app.services.ocr import extract_text_from_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

HEADLESS = os.environ.get("HEADLESS", "True").lower() == "true"
BASE_URL = "https://aphis.my.site.com/PublicSearchTool/s/inspection-reports"

HASH_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def generate_hash_id(url: str) -> str:
    """Generate a unique hash for the PDF from its URL or query params."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    if "ids" in qs:
        return qs["ids"][0]
    elif "oid" in qs and "d" in qs:
        return hashlib.md5((qs["oid"][0] + qs["d"][0]).encode(), usedforsecurity=False).hexdigest()  # noqa: S324

    import hashlib

    return hashlib.md5(url.encode(), usedforsecurity=False).hexdigest()  # noqa: S324


def _download_with_retry(url: str, retries: int = 3, timeout: int = 15) -> bytes | None:
    return download_pdf_bytes(url, retries=retries, timeout=timeout)


def scrape_state(state_code: str = "TX", license_type: str = "BREEDER", max_pages: int = 10) -> int:
    """
    Scrape USDA inspections using JS-driven Network Interception to bypass
    Salesforce DOM obfuscation.
    """
    logger.info(f"Starting USDA sync for {state_code} - {license_type} (Headless: {HEADLESS})")

    db = SessionLocal()
    try:
        latest_date = db.query(func.max(Inspection.inspection_date)).scalar()
        if latest_date:
            logger.info(f"Latest inspection date in DB: {latest_date}")
        else:
            logger.info("No existing inspections found. Performing full historical sync.")
            latest_date = date(2000, 1, 1)

        downloaded_count = 0
        intercepted_records = []

        def handle_response(response):
            if "aura" in response.url and response.status == 200:
                try:
                    body = response.text()
                    if body.startswith("{") and "actions" in body:
                        data = json.loads(body)
                        for action in data.get("actions", []):
                            if action.get("state") == "SUCCESS":
                                ret = action.get("returnValue", {})
                                if "results" in ret and isinstance(ret["results"], list):
                                    for r in ret["results"]:
                                        if "reportLink" in r:
                                            intercepted_records.append(r)
                except Exception as e:
                    logger.debug("Failed parsing response: %s", e)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=HEADLESS, args=["--no-sandbox"])
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            page.on("response", handle_response)

            try:
                page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(5000)

                # Select State
                state_dropdown = page.locator('button[aria-label="State"]')
                if state_dropdown.count() > 0:
                    state_dropdown.click()
                    page.locator(f'lightning-base-combobox-item[data-value="{state_code}"]').click()

                page.wait_for_timeout(1000)

                # Select License Type
                type_dropdown = page.locator('button[aria-label="Certificate Type"]')
                if type_dropdown.count() > 0:
                    type_dropdown.click()
                    page.locator(
                        f'lightning-base-combobox-item[data-value="{license_type}"]'
                    ).click()

                page.wait_for_timeout(1000)

                # Click Search
                search_btn = page.locator('button:has-text("Search")')
                if search_btn.count() > 0:
                    search_btn.click()

                page.wait_for_timeout(8000)

                current_page = 1
                while current_page <= max_pages:
                    logger.info(
                        f"Page {current_page}: Executing JS to query all inspection reports..."
                    )

                    # Use JS to click all "Query" buttons to trigger network requests
                    page.evaluate("""
                        const btns = Array.from(document.querySelectorAll('button[title="Query Inspection Reports"]'));  // noqa: E501
                        for(let i=0; i<btns.length; i++) {
                            setTimeout(() => btns[i].click(), i * 400); // Stagger clicks to prevent rate limits  // noqa: E501
                        }
                    """)

                    # Wait for all network requests to finish
                    page.wait_for_timeout(15000)

                    logger.info(f"Captured {len(intercepted_records)} records total so far.")

                    # Click Next Page
                    next_btn = page.locator('button[title="Next Page"]')
                    if next_btn.count() > 0 and not next_btn.is_disabled():
                        next_btn.click()
                        page.wait_for_timeout(5000)
                        current_page += 1
                    else:
                        break

            except PlaywrightTimeoutError:
                logger.error("Playwright timed out waiting for page to load.")
            except Exception as e:
                logger.error(f"Scraper encountered a critical error: {e}")

            browser.close()

        # Deduplicate records by hash id
        unique_records = {}
        for r in intercepted_records:
            pdf_link = r.get("reportLink", "")
            if pdf_link:
                hash_id = generate_hash_id(pdf_link)
                if not HASH_RE.match(hash_id):
                    logger.warning(f"Invalid hash generated: {hash_id}. Skipping record.")
                    continue
                unique_records[hash_id] = r

        logger.info(
            f"Finished interception. Processing {len(unique_records)} unique valid records."
        )

        pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)

        for hash_id, rec in unique_records.items():
            try:
                cert_num = rec.get("certNumber", "").strip()
                customer_name = (
                    rec.get("customerName", "").strip() or rec.get("accountName", "").strip()
                )
                city = rec.get("siteCity", "").strip() or rec.get("customerCity", "").strip()
                state = rec.get("siteState", "").strip() or rec.get("customerState", "").strip()
                insp_type = rec.get("inspectionType", "ROUTINE INSPECTION").strip()
                raw_date = rec.get("inspectionDate", "")
                pdf_link = rec.get("reportLink", "")

                if not pdf_link.startswith("http"):
                    pdf_link = f"https://aphis.file.force.com{pdf_link}"

                insp_date = None
                if raw_date:
                    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S.%fZ", "%m/%d/%Y"):
                        try:
                            # Keep parsed time timezone-aware before extracting date to satisfy DTZ
                            parsed_dt = datetime.strptime(raw_date, fmt)  # noqa: DTZ007
                            if parsed_dt.tzinfo is None:
                                parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                            insp_date = parsed_dt.date()
                            break
                        except ValueError:
                            continue

                if not insp_date:
                    continue

                if (latest_date - insp_date).days > 7:
                    continue

                exists = (
                    db.query(Inspection)
                    .join(Facility)
                    .filter(
                        Facility.certificate_number == cert_num,
                        Inspection.inspection_date == insp_date,
                        Inspection.source_pdf_path == hash_id,
                    )
                    .first()
                )

                if exists:
                    continue

                facility = (
                    db.query(Facility).filter(Facility.certificate_number == cert_num).first()
                )
                if not facility:
                    facility = Facility(
                        name=customer_name,
                        certificate_number=cert_num,
                        license_type=license_type,
                        license_status="ACTIVE",
                        city=city,
                        state=state,
                    )
                    db.add(facility)
                    db.flush()

                filepath = pdf_dir / f"{hash_id}.pdf"
                sha256_hash = None
                if not filepath.exists():
                    logger.info(f"Downloading PDF: {hash_id}.pdf")
                    content = _download_with_retry(pdf_link)
                    if content is not None:
                        filepath.write_bytes(content)
                        sha256_hash = sha256_bytes(content)
                        time.sleep(1)  # Throttle downloads
                    else:
                        logger.error(f"Failed to download {pdf_link}")
                        continue
                else:
                    try:
                        sha256_hash = sha256_file(filepath)
                    except Exception:
                        pass

                inspection = Inspection(
                    facility_id=facility.id,
                    inspection_date=insp_date,
                    inspection_type=insp_type,
                    source_pdf=pdf_link,
                    source_pdf_path=hash_id,
                    processing_status=ProcessingStatus.PENDING,
                    source_type="USDA_DIRECT",
                    pdf_sha256=sha256_hash,
                )
                db.add(inspection)
                db.commit()
                downloaded_count += 1

            except Exception:
                logger.exception("Error processing record %s", hash_id)
                db.rollback()

        logger.info(f"Sync complete. {downloaded_count} new inspections added.")
        return downloaded_count

    finally:
        db.close()


def check_and_download_new_pdfs():
    """Wrapper for the scheduler to trigger the sync across priority states."""
    total_downloaded = 0
    for state in ["TX"]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(scrape_state, state_code=state, license_type="BREEDER")
            try:
                # 30 minutes overall timeout for this state's scrape
                total_downloaded += future.result(timeout=1800)
            except concurrent.futures.TimeoutError:
                logger.error("Scraper timed out after 30 minutes for state %s", state)
            except Exception:
                logger.exception("Scraper failed for state %s", state)
    return total_downloaded


def scrape_enforcement_actions(max_pages: int = 40) -> int:
    """
    Scrape USDA warnings and enforcement actions from:
    https://www.aphis.usda.gov/animal-care/awa-services/animal-welfare-horse-protection-actions
    
    Only process and link records that match existing facilities in the DB.
    Focus on facilities with 2025-2026 inspection data.
    """
    logger.info("Starting USDA Enforcement Actions sync...")
    db = SessionLocal()
    downloaded_count = 0
    
    # Pre-fetch existing facility mappings to avoid repeated DB queries
    facilities = db.query(Facility.id, Facility.customer_id, Facility.certificate_number).all()
    cust_map = {f.customer_id.strip(): f.id for f in facilities if f.customer_id}
    cert_map = {f.certificate_number.strip(): f.id for f in facilities if f.certificate_number}
    
    # Identify priority facilities with 2025-2026 inspection data
    priority_ids = {
        row[0] for row in db.query(Inspection.facility_id)
        .filter(Inspection.inspection_date >= date(2025, 1, 1))
        .all()
    }
    
    try:
        captured_records = []
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=HEADLESS, args=["--no-sandbox"])
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            url = "https://www.aphis.usda.gov/animal-care/awa-services/animal-welfare-horse-protection-actions"
            
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(5000)
                
                current_page = 1
                stop_scraping = False
                
                while current_page <= max_pages and not stop_scraping:
                    logger.info(f"Scraping enforcement page {current_page}...")
                    rows = page.locator("table tbody tr").all()
                    
                    if not rows:
                        logger.warning("No rows found in table.")
                        break
                        
                    for row in rows:
                        cells = row.locator("td").all()
                        if len(cells) < 7:
                            continue
                            
                        # Column 0: Link with DBA name
                        link_el = cells[0].locator("a")
                        if link_el.count() > 0:
                            dba = link_el.text_content().strip()
                            pdf_href = link_el.get_attribute("href")
                        else:
                            dba = cells[0].text_content().strip()
                            pdf_href = None
                            
                        cert_num = cells[2].text_content().strip()
                        cust_num = cells[3].text_content().strip()
                        lic_category = cells[4].text_content().strip()
                        date_str = cells[5].text_content().strip()
                        enf_type = cells[6].text_content().strip()
                        
                        # Parse date
                        action_date = None
                        for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
                            try:
                                parsed_dt = datetime.strptime(date_str, fmt)  # noqa: DTZ007
                                if parsed_dt.tzinfo is None:
                                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                                action_date = parsed_dt.date()
                                break
                            except ValueError:
                                continue
                                
                        if not action_date:
                            continue
                            
                        # Check date limit (2025-2026 only)
                        if action_date.year < 2025:
                            logger.info(f"Reached record dated {action_date} (< 2025). Stopping scraper.")
                            stop_scraping = True
                            break
                            
                        if pdf_href and not pdf_href.startswith("http"):
                            pdf_href = f"https://www.aphis.usda.gov{pdf_href}"
                            
                        captured_records.append({
                            "dba": dba,
                            "certificate": cert_num,
                            "customer_id": cust_num,
                            "license_category": lic_category,
                            "action_date": action_date,
                            "action_type": enf_type,
                            "source_pdf": pdf_href,
                        })
                        
                    if stop_scraping:
                        break
                        
                    # Click next page
                    next_button = page.locator("a.dt-paging-button.next")
                    if next_button.count() == 0 or "disabled" in (next_button.get_attribute("class") or ""):
                        next_button = page.locator("button.next")
                    if next_button.count() == 0 or "disabled" in (next_button.get_attribute("class") or ""):
                        next_button = page.get_by_role("link", name="Next")
                        
                    if next_button.count() > 0 and next_button.first.is_visible() and "disabled" not in (next_button.first.get_attribute("class") or ""):
                        next_button.first.click()
                        page.wait_for_timeout(3000)
                        current_page += 1
                    else:
                        break
            except Exception as e:
                logger.error(f"Error during page navigation/scraping: {e}")
            finally:
                browser.close()
                
        # Now process captured records and match to existing facilities in DB
        logger.info(f"Processing {len(captured_records)} enforcement actions...")
        pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        for rec in captured_records:
            cust_id_clean = rec["customer_id"].strip()
            cert_clean = rec["certificate"].strip()
            
            # 1. Match Customer ID
            facility_id = cust_map.get(cust_id_clean)
            
            # 2. Fallback to Certificate Number
            if not facility_id and cert_clean:
                facility_id = cert_map.get(cert_clean)
                
            # If no matching facility exists, skip the record.
            if not facility_id:
                logger.debug(f"Skipping record for '{rec['dba']}' (Cust: {cust_id_clean}, Cert: {cert_clean}): No matching facility in DB.")
                continue
                
            is_priority = facility_id in priority_ids
            logger.info(f"Linked enforcement for '{rec['dba']}' (Facility ID: {facility_id}, Priority: {is_priority})")
            
            pdf_link = rec["source_pdf"]
            if not pdf_link:
                continue
                
            hash_id = generate_hash_id(pdf_link)
            if not HASH_RE.match(hash_id):
                logger.warning(f"Invalid hash generated: {hash_id}. Skipping record.")
                continue
                
            # Check if record already exists in DB
            exists = db.query(EnforcementAction).filter(
                EnforcementAction.facility_id == facility_id,
                EnforcementAction.action_date == rec["action_date"],
                EnforcementAction.source_pdf_path == hash_id
            ).first()
            
            if exists:
                continue
                
            # Download PDF
            filepath = pdf_dir / f"{hash_id}.pdf"
            pdf_text = ""
            sha256_hash = None
            if not filepath.exists():
                logger.info(f"Downloading enforcement PDF: {hash_id}.pdf from {pdf_link}")
                content = _download_with_retry(pdf_link, retries=1, timeout=2)
                if content is not None:
                    filepath.write_bytes(content)
                    sha256_hash = sha256_bytes(content)
                    time.sleep(1)  # Throttle downloads
                else:
                    logger.error(f"Failed to download PDF from {pdf_link}")
            else:
                try:
                    sha256_hash = sha256_file(filepath)
                except Exception:
                    pass
                    
            if filepath.exists():
                try:
                    ext_res = extract_text_from_pdf(filepath)
                    if ext_res.get("success"):
                        pdf_text = ext_res.get("text", "")
                except Exception as e:
                    logger.error(f"Failed extracting text from {filepath}: {e}")
                    
            # Parse penalty amount
            penalty_amount = None
            if pdf_text:
                penalty_matches = []
                for match in re.finditer(r"\$\s*([0-9,]+(?:\.[0-9]{2})?)", pdf_text):
                    val_str = match.group(1).replace(",", "")
                    try:
                        penalty_matches.append(float(val_str))
                    except ValueError:
                        continue
                if penalty_matches:
                    context_match = re.search(r"(?:civil penalty|penalty|fine|assess)\s*(?:of|in the amount of|valued at)?\s*\$\s*([0-9,]+(?:\.[0-9]{2})?)", pdf_text, re.IGNORECASE)
                    if context_match:
                        try:
                            penalty_amount = float(context_match.group(1).replace(",", ""))
                        except ValueError:
                            pass
                    if penalty_amount is None:
                        reasonable_fines = [p for p in penalty_matches if p < 1000000]
                        if reasonable_fines:
                            penalty_amount = max(reasonable_fines)
                            
            # Create a clean summary
            summary = ""
            pdf_downloaded = False
            pdf_processed = False
            ocr_status = ProcessingStatus.PENDING
            extracted_text = None

            if pdf_text:
                cleaned_text = re.sub(r"\s+", " ", pdf_text).strip()
                summary = cleaned_text[:600]
                if len(cleaned_text) > 600:
                    summary += "..."
                pdf_downloaded = True
                pdf_processed = True
                ocr_status = ProcessingStatus.COMPLETED
                extracted_text = pdf_text
            else:
                summary = f"USDA AWA Enforcement Action ({rec['action_type']}) on {rec['action_date']}"
                if filepath.exists():
                    pdf_downloaded = True
                    pdf_processed = False
                    ocr_status = ProcessingStatus.FAILED
                
            enforcement = EnforcementAction(
                facility_id=facility_id,
                certificate=cert_clean or None,
                action_type=rec["action_type"],
                action_date=rec["action_date"],
                outcome=rec["action_type"],
                penalty_amount=penalty_amount,
                source_pdf=pdf_link,
                source_pdf_path=hash_id,
                summary=summary,
                pdf_downloaded=pdf_downloaded,
                pdf_processed=pdf_processed,
                ocr_status=ocr_status,
                extracted_text=extracted_text,
                pdf_sha256=sha256_hash,
            )
            db.add(enforcement)
            db.commit()
            downloaded_count += 1
            
        logger.info(f"Enforcement actions sync complete. {downloaded_count} records imported.")
        return downloaded_count
        
    finally:
        db.close()


def enrich_enforcement_pdfs(db: Session, limit: int = 50) -> int:
    """
    Optional enrichment pass for enforcement records:
    1. Finds 2025-2026 enforcement records linked to facilities where pdf_downloaded is False or ocr_status is PENDING.
    2. Downloads PDFs using urllib.request with robust retry, saves to local storage.
    3. Runs OCR, extracts text, stores extracted text, updates pdf_downloaded/processed, ocr_status, summary, and penalty amount.
    4. Never blocks if USDA rate-limits/timeouts (keeps ocr_status as PENDING).
    """
    logger.info("Starting Enforcement Actions PDF enrichment pass...")

    refresh_every = int(os.environ.get("ENFORCEMENT_SESSION_REFRESH_EVERY", "25"))
    checkpoint_every = int(os.environ.get("ENFORCEMENT_CHECKPOINT_EVERY", "10"))
    commit_retries = int(os.environ.get("ENFORCEMENT_COMMIT_RETRIES", "1"))
    active_db = db
    start_time = time.time()

    def _pending_filter(query: Session):
        return query.filter(
            EnforcementAction.facility_id.isnot(None),
            EnforcementAction.action_date >= date(2025, 1, 1),
            or_(
                EnforcementAction.pdf_downloaded.is_(False),
                EnforcementAction.ocr_status == ProcessingStatus.PENDING,
            ),
        )

    def _counts() -> tuple[int, int, int]:
        base = active_db.query(EnforcementAction).filter(
            EnforcementAction.facility_id.isnot(None),
            EnforcementAction.action_date >= date(2025, 1, 1),
        )
        completed = base.filter(EnforcementAction.ocr_status == ProcessingStatus.COMPLETED).count()
        pending = base.filter(
            or_(
                EnforcementAction.pdf_downloaded.is_(False),
                EnforcementAction.ocr_status == ProcessingStatus.PENDING,
            )
        ).count()
        failed = base.filter(EnforcementAction.ocr_status == ProcessingStatus.FAILED).count()
        return completed, pending, failed

    def _recreate_session() -> Session:
        nonlocal active_db
        try:
            active_db.close()
        except Exception:
            pass
        active_db = SessionLocal()
        logger.info("Recreated database session after connection failure.")
        return active_db

    def _commit_action_updates(action_id: int, updates: dict[str, object], mark_success: bool) -> bool:
        nonlocal active_db
        attempts = 0
        while attempts <= commit_retries:
            try:
                active_db.commit()
                if mark_success:
                    logger.info("Committed enrichment updates for action %s.", action_id)
                return True
            except OperationalError as e:
                attempts += 1
                logger.error(
                    "OperationalError during commit for action %s (attempt %s/%s): %s",
                    action_id,
                    attempts,
                    commit_retries + 1,
                    e,
                )
                try:
                    active_db.rollback()
                except Exception:
                    pass
                if attempts > commit_retries:
                    logger.error("Skipping action %s after commit retries exhausted.", action_id)
                    return False
                _recreate_session()
                action_retry = active_db.get(EnforcementAction, action_id)
                if not action_retry:
                    logger.error("Action %s no longer exists during retry. Skipping.", action_id)
                    return False
                for key, value in updates.items():
                    setattr(action_retry, key, value)
            except Exception as e:
                logger.error("Unexpected commit failure for action %s: %s", action_id, e)
                try:
                    active_db.rollback()
                except Exception:
                    pass
                return False
        return False

    # Query action IDs so session refreshes can safely reload each record.
    action_rows = (
        _pending_filter(active_db.query(EnforcementAction.id))
        .order_by(desc(EnforcementAction.action_date))
        .limit(limit)
        .all()
    )
    action_ids = [row[0] for row in action_rows]

    if not action_ids:
        logger.info("No enforcement records found that require PDF enrichment.")
        return 0

    logger.info("Found %s enforcement actions to enrich.", len(action_ids))
    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)

    processed_count = 0
    success_count = 0
    failed_count = 0

    for i, action_id in enumerate(action_ids, 1):
        if refresh_every > 0 and i > 1 and (i - 1) % refresh_every == 0:
            logger.info("Periodic DB session refresh at checkpoint %s.", i - 1)
            _recreate_session()

        action = active_db.get(EnforcementAction, action_id)
        if not action:
            logger.warning("Action %s not found; skipping.", action_id)
            failed_count += 1
            continue

        pdf_link = action.source_pdf
        hash_id = action.source_pdf_path
        if not pdf_link or not hash_id:
            logger.warning("Action %s missing PDF metadata; skipping.", action.id)
            failed_count += 1
            continue

        logger.info(
            "[%s/%s] Processing enrichment for action ID %s (Facility ID: %s)",
            i,
            len(action_ids),
            action.id,
            action.facility_id,
        )

        updates: dict[str, object] = {}
        filepath = pdf_dir / f"{hash_id}.pdf"
        download_success = False
        sha256_hash = None

        # Download if not exists locally
        if filepath.exists():
            download_success = True
            action.pdf_downloaded = True
            updates["pdf_downloaded"] = True
            try:
                sha256_hash = sha256_file(filepath)
                action.pdf_sha256 = sha256_hash
                updates["pdf_sha256"] = sha256_hash
            except Exception:
                pass
        else:
            logger.info("Downloading PDF: %s", pdf_link)
            content = _download_with_retry(pdf_link, retries=1, timeout=5)
            if content is not None:
                try:
                    filepath.write_bytes(content)
                    download_success = True
                    action.pdf_downloaded = True
                    updates["pdf_downloaded"] = True
                    sha256_hash = sha256_bytes(content)
                    action.pdf_sha256 = sha256_hash
                    updates["pdf_sha256"] = sha256_hash
                    logger.info("PDF downloaded successfully.")
                    time.sleep(1)  # Throttle to respect rate limits
                except Exception as e:
                    logger.error("Failed to write bytes to %s: %s", filepath, e)
                    action.pdf_downloaded = False
                    action.ocr_status = ProcessingStatus.PENDING
                    updates["pdf_downloaded"] = False
                    updates["ocr_status"] = ProcessingStatus.PENDING
            else:
                logger.warning(
                    "Download timed out or failed for %s. Keeping status as enrichment pending.",
                    pdf_link,
                )
                action.pdf_downloaded = False
                action.ocr_status = ProcessingStatus.PENDING
                updates["pdf_downloaded"] = False
                updates["ocr_status"] = ProcessingStatus.PENDING

        if download_success:
            # Run OCR
            logger.info("Running OCR / text extraction...")
            pdf_text = ""
            try:
                ext_res = extract_text_from_pdf(filepath)
                if ext_res.get("success"):
                    pdf_text = ext_res.get("text", "")
                    action.pdf_processed = True
                    action.ocr_status = ProcessingStatus.COMPLETED
                    action.extracted_text = pdf_text
                    updates["pdf_processed"] = True
                    updates["ocr_status"] = ProcessingStatus.COMPLETED
                    updates["extracted_text"] = pdf_text
                    logger.info("OCR completed successfully.")
                else:
                    action.ocr_status = ProcessingStatus.FAILED
                    updates["ocr_status"] = ProcessingStatus.FAILED
                    logger.warning("OCR failed to extract text.")
            except Exception as e:
                action.ocr_status = ProcessingStatus.FAILED
                updates["ocr_status"] = ProcessingStatus.FAILED
                logger.error("Error during OCR execution: %s", e)

            if pdf_text:
                # Update penalty amount if not already set
                if not action.penalty_amount:
                    penalty_matches = []
                    for match in re.finditer(r"\$\s*([0-9,]+(?:\.[0-9]{2})?)", pdf_text):
                        val_str = match.group(1).replace(",", "")
                        try:
                            penalty_matches.append(float(val_str))
                        except ValueError:
                            continue
                    if penalty_matches:
                        penalty_amount = None
                        context_match = re.search(
                            r"(?:civil penalty|penalty|fine|assess)\s*(?:of|in the amount of|valued at)?\s*\$\s*([0-9,]+(?:\.[0-9]{2})?)",
                            pdf_text,
                            re.IGNORECASE,
                        )
                        if context_match:
                            try:
                                penalty_amount = float(context_match.group(1).replace(",", ""))
                            except ValueError:
                                pass
                        if penalty_amount is None:
                            reasonable_fines = [p for p in penalty_matches if p < 1000000]
                            if reasonable_fines:
                                penalty_amount = max(reasonable_fines)
                        if penalty_amount:
                            action.penalty_amount = penalty_amount
                            updates["penalty_amount"] = penalty_amount
                            logger.info("Extracted/updated penalty amount: $%.2f", penalty_amount)

                # Update summary if default
                if not action.summary or action.summary.startswith("USDA AWA Enforcement Action"):
                    cleaned_text = re.sub(r"\s+", " ", pdf_text).strip()
                    summary = cleaned_text[:600]
                    if len(cleaned_text) > 600:
                        summary += "..."
                    action.summary = summary
                    updates["summary"] = summary

            success_count += 1

        if updates:
            committed = _commit_action_updates(action.id, updates, mark_success=download_success)
            if not committed:
                failed_count += 1

        processed_count += 1

        if checkpoint_every > 0 and (i % checkpoint_every == 0 or i == len(action_ids)):
            completed_total, pending_total, failed_total = _counts()
            elapsed = max(time.time() - start_time, 1e-6)
            rate = processed_count / elapsed
            eta_seconds = pending_total / rate if rate > 0 else float("inf")
            eta_display = f"{eta_seconds / 60:.1f}m" if eta_seconds != float("inf") else "unknown"
            logger.info(
                "[Checkpoint] batch_progress=%s/%s processed=%s success=%s failed=%s totals(completed=%s,pending=%s,failed=%s) eta=%s",
                i,
                len(action_ids),
                processed_count,
                success_count,
                failed_count,
                completed_total,
                pending_total,
                failed_total,
                eta_display,
            )

    completed_total, pending_total, failed_total = _counts()
    logger.info(
        "Enforcement PDF enrichment pass complete. processed=%s success=%s failed=%s totals(completed=%s,pending=%s,failed=%s)",
        processed_count,
        success_count,
        failed_count,
        completed_total,
        pending_total,
        failed_total,
    )

    if active_db is not db:
        active_db.close()

    return processed_count


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "enforcement":
        scrape_enforcement_actions()
    elif len(sys.argv) > 1 and sys.argv[1] == "enrich-enforcement":
        while True:
            db_session = SessionLocal()
            try:
                num_processed = enrich_enforcement_pdfs(db_session, limit=100)
                if num_processed == 0:
                    logger.info("No more enforcement records to enrich. Exiting loop.")
                    break
            finally:
                db_session.close()
            logger.info("Sleeping 5 seconds before next batch...")
            time.sleep(5)
    else:
        scrape_state("TX", "BREEDER", max_pages=1)

