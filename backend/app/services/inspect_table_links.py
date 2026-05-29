from playwright.sync_api import sync_playwright

HEADLESS = True

def inspect_page():
    print("Launching browser...")
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
        print(f"Navigating to {url}...")
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(5000)
        
        # Let's locate the table or search for rows
        # The table headers shown in previous task run were:
        # DBA | Certificate # | Customer # | License Category | Date | Enforcement Type
        # Let's find rows in a table.
        rows = page.locator("table tr").all()
        print(f"Total rows found: {len(rows)}")
        
        for i, row in enumerate(rows[:5]):
            print(f"\n--- ROW {i} HTML ---")
            print(row.inner_html())
            
        browser.close()

if __name__ == "__main__":
    inspect_page()
