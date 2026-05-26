import os
import time
import json
import logging
import hashlib
from datetime import datetime, date
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from sqlalchemy import func
from sqlalchemy.orm import Session
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from app.database import SessionLocal
from app.models import Facility, Inspection, ProcessingStatus

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

HEADLESS = os.environ.get("HEADLESS", "True").lower() == "true"
BASE_URL = "https://aphis.my.site.com/PublicSearchTool/s/inspection-reports"

def generate_hash_id(url: str) -> str:
    """Generate a unique hash for the PDF from its URL or query params."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    
    if "ids" in qs:
        return qs["ids"][0]
    elif "oid" in qs and "d" in qs:
        return hashlib.md5((qs["oid"][0] + qs["d"][0]).encode()).hexdigest()
        
    return hashlib.md5(url.encode()).hexdigest()

def scrape_state(state_code: str = "TX", license_type: str = "BREEDER", max_pages: int = 10) -> int:
    """
    Scrape USDA inspections using JS-driven Network Interception to bypass Salesforce DOM obfuscation.
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
                except Exception:
                    pass
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=HEADLESS, args=['--no-sandbox'])
            context = browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
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
                    page.locator(f'lightning-base-combobox-item[data-value="{license_type}"]').click()
                
                page.wait_for_timeout(1000)
                
                # Click Search
                search_btn = page.locator('button:has-text("Search")')
                if search_btn.count() > 0:
                    search_btn.click()
                
                page.wait_for_timeout(8000)
                
                current_page = 1
                while current_page <= max_pages:
                    logger.info(f"Page {current_page}: Executing JS to query all inspection reports...")
                    
                    # Use JS to click all "Query" buttons to trigger network requests
                    page.evaluate("""
                        const btns = Array.from(document.querySelectorAll('button[title="Query Inspection Reports"]'));
                        for(let i=0; i<btns.length; i++) {
                            setTimeout(() => btns[i].click(), i * 400); // Stagger clicks to prevent rate limits
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
                unique_records[hash_id] = r
                
        logger.info(f"Finished interception. Processing {len(unique_records)} unique valid records.")
        
        pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        for hash_id, rec in unique_records.items():
            try:
                cert_num = rec.get("certNumber", "").strip()
                customer_name = rec.get("customerName", "").strip() or rec.get("accountName", "").strip()
                city = rec.get("siteCity", "").strip() or rec.get("customerCity", "").strip()
                state = rec.get("siteState", "").strip() or rec.get("customerState", "").strip()
                insp_type = rec.get("inspectionType", "ROUTINE INSPECTION").strip()
                raw_date = rec.get("inspectionDate", "")
                pdf_link = rec.get("reportLink", "")
                
                if not pdf_link.startswith('http'):
                    pdf_link = f"https://aphis.file.force.com{pdf_link}"
                    
                insp_date = None
                if raw_date:
                    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S.%fZ", "%m/%d/%Y"):
                        try:
                            insp_date = datetime.strptime(raw_date, fmt).date()
                            break
                        except ValueError:
                            continue
                
                if not insp_date:
                    continue
                    
                if (latest_date - insp_date).days > 7:
                    continue
                
                exists = db.query(Inspection).join(Facility).filter(
                    Facility.certificate_number == cert_num,
                    Inspection.inspection_date == insp_date,
                    Inspection.source_pdf_path == hash_id
                ).first()
                
                if exists:
                    continue
                    
                facility = db.query(Facility).filter(Facility.certificate_number == cert_num).first()
                if not facility:
                    facility = Facility(
                        name=customer_name,
                        certificate_number=cert_num,
                        license_type=license_type,
                        license_status="ACTIVE",
                        city=city,
                        state=state
                    )
                    db.add(facility)
                    db.flush()
                    
                filepath = pdf_dir / f"{hash_id}.pdf"
                if not filepath.exists():
                    import requests
                    logger.info(f"Downloading PDF: {hash_id}.pdf")
                    resp = requests.get(pdf_link)
                    if resp.status_code == 200:
                        filepath.write_bytes(resp.content)
                        time.sleep(1) # Throttle downloads
                    else:
                        logger.error(f"Failed to download {pdf_link}: {resp.status_code}")
                        continue
                
                inspection = Inspection(
                    facility_id=facility.id,
                    inspection_date=insp_date,
                    inspection_type=insp_type,
                    source_pdf=pdf_link,
                    source_pdf_path=hash_id,
                    processing_status=ProcessingStatus.PENDING,
                    source_type="USDA_DIRECT"
                )
                db.add(inspection)
                db.commit()
                downloaded_count += 1
                
            except Exception as e:
                logger.error(f"Error processing record {hash_id}: {e}")
                db.rollback()
                
        logger.info(f"Sync complete. {downloaded_count} new inspections added.")
        return downloaded_count

    finally:
        db.close()

def check_and_download_new_pdfs():
    """Wrapper for the scheduler to trigger the sync across priority states."""
    total_downloaded = 0
    for state in ["TX"]:
        total_downloaded += scrape_state(state_code=state, license_type="BREEDER")
    return total_downloaded

if __name__ == "__main__":
    scrape_state("TX", "BREEDER", max_pages=1)
