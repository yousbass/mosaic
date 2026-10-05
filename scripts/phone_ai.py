from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_URL = (ROOT / "dist" / "test.html").as_uri()
SHOTS = ROOT / "shots2"
SHOTS.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright
FAKE = open(HERE / "fake_ai.js").read()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark", timezone_id="Asia/Bahrain")
    ctx.add_init_script(FAKE)
    pg = ctx.new_page()
    pg.goto(ROOT_URL + "#home"); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Ask Mosaic").first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{SHOTS}/phone-assistant-welcome.png")
    pg.locator(".starter").nth(1).click(); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{SHOTS}/phone-assistant.png")
    pg.get_by_role("button", name="Close", exact=True).first.click(); pg.goto(ROOT_URL + "#pg_j2"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Customize").click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{SHOTS}/phone-customize.png")
    b.close()
