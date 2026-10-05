# Walk through the main flows with a stand-in for the claude.ai AI, saving screenshots.
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_URL = (ROOT / "dist" / "test.html").as_uri()
SHOTS = ROOT / "shots2"
SHOTS.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright
FAKE = open(HERE / "fake_ai.js").read()
URL = ROOT_URL
errors, notes = [], []
def shot(pg, name): pg.screenshot(path=f"{SHOTS}/ui-{name}.png")
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Bahrain", locale="en-GB")
    ctx.add_init_script(FAKE)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "ERR_" not in m.text else None)
    pg.goto(URL + "#pg_j1"); pg.wait_for_timeout(400)

    # Customize a job page: real drag of LinkedIn from the library onto the page
    pg.get_by_role("button", name="Customize").click(); pg.wait_for_timeout(250)
    n0 = pg.locator("section.card").count()
    pg.locator(".lib-item", has_text="LinkedIn").drag_to(pg.locator(".drop-slot")); pg.wait_for_timeout(300)
    n1 = pg.locator("section.card").count()
    notes.append(f"drag from library onto page: {n0} -> {n1} cards")
    assert n1 == n0 + 1
    pg.locator(".lib-item", has_text="LinkedIn").click(); pg.wait_for_timeout(250)
    shot(pg, "customize")
    # resize the new card and finish
    last = pg.locator("section.card").last
    last.get_by_role("button", name="Full width").click(); pg.wait_for_timeout(150)
    pg.get_by_role("button", name="Done", exact=True).first.click(); pg.wait_for_timeout(250)
    # Connect LinkedIn for University from inside the card
    pg.locator("section.card").last.get_by_role("button", name="Connect account").click(); pg.wait_for_timeout(250)
    label = pg.input_value("#cw-label"); notes.append(f"suggested label: {label}")
    pg.fill("#cw-account", "linkedin.com/in/dr-you")
    shot(pg, "wizard-details")
    pg.get_by_role("button", name="Continue", exact=True).click(); pg.wait_for_timeout(200)
    shot(pg, "wizard-signin")
    pg.get_by_role("button", name="Continue to LinkedIn").click(); pg.wait_for_timeout(1400)
    shot(pg, "wizard-done")
    pg.get_by_role("button", name="Done", exact=True).click(); pg.wait_for_timeout(250)
    notes.append("card now titled: " + pg.locator("section.card").last.locator("h3").inner_text())
    shot(pg, "job-after-connect")

    # Add a named email account from the Accounts page
    pg.evaluate("location.hash='connections'"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Add account").first.click(); pg.wait_for_timeout(200)
    pg.locator(".modal .app-choice", has_text="Gmail").click(); pg.wait_for_timeout(150)
    pg.locator("label", has_text="Seef Studio").locator("input").check()
    pg.fill("#cw-label", "Studio bookings email"); pg.fill("#cw-account", "bookings@seefstudio")
    notes.append("bad email blocks continue: " + str(pg.get_by_role("button", name="Continue", exact=True).is_disabled()))
    pg.fill("#cw-account", "bookings@seefstudio.bh")
    pg.get_by_role("button", name="Continue", exact=True).click()
    pg.get_by_role("button", name="Continue to Google").click(); pg.wait_for_timeout(1400)
    pg.get_by_role("button", name="Done", exact=True).click(); pg.wait_for_timeout(200)
    shot(pg, "accounts")

    # Assistant with actions
    pg.evaluate("location.hash='home'"); pg.wait_for_timeout(300)
    pg.fill("#home-ask", "Book a 45-minute Teams call with Fatima tomorrow and draft the invite"); pg.keyboard.press("Enter")
    pg.wait_for_timeout(900)
    shot(pg, "assistant")
    notes.append(f"action cards: {pg.locator('.act-card').count()}")
    pg.locator(".act-card").first.get_by_role("button", name="Undo").click(); pg.wait_for_timeout(200)
    notes.append(f"undone cards: {pg.locator('.act-card.undone').count()}")
    pg.get_by_role("button", name="Fast", exact=True).click()
    pg.fill("#assistant-input", "hi"); pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    notes.append("tiers used: " + str(pg.evaluate("window.__tiers")))
    shot(pg, "assistant-2")
    pg.get_by_role("button", name="Close", exact=True).first.click()

    # Arabic
    pg.get_by_role("button", name="عربي").click(); pg.wait_for_timeout(250)
    shot(pg, "ar-home")
    pg.evaluate("location.hash='pg_j2'"); pg.wait_for_timeout(300)
    shot(pg, "ar-job")
    b.close()
print("\n".join(notes)); print("\n".join(errors) or "NO PAGE ERRORS")
