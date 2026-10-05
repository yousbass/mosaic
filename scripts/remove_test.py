# Removing accounts: one at a time, from the edit dialog, all demo accounts at once, with Undo.
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_URL = (ROOT / "dist" / "test.html").as_uri()
SHOTS = ROOT / "shots2"
SHOTS.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright
FAKE = open(HERE / "fake_ai.js").read() + "\n" + open(HERE / "fake_live.js").read()
URL = ROOT_URL
errors, notes = [], []
def check(cond, msg): notes.append(("ok   " if cond else "FAIL ") + msg)
def shot(pg, name): pg.screenshot(path=f"{SHOTS}/remove-{name}.png")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Bahrain", locale="en-GB")
    ctx.add_init_script(FAKE)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "ERR_" not in m.text else None)
    pg.goto(URL + "#connections"); pg.wait_for_timeout(500)
    rows0 = pg.locator(".acct-row").count()
    inbox0 = pg.evaluate("document.querySelectorAll('.side .badge, .nav-count').length")

    # 1. remove one account and its mail, then undo
    pg.get_by_role("button", name="Remove Board email").click(); pg.wait_for_timeout(200)
    dlg = pg.locator(".modal")
    check("Remove Board email?" in dlg.inner_text(), "asks before removing")
    check(pg.is_checked("#rm-data") and "emails" in dlg.inner_text(), "offers to delete its emails too (on by default)")
    shot(pg, "dialog")
    dlg.get_by_role("button", name="Remove account").click(); pg.wait_for_timeout(300)
    check(pg.locator(".acct-row").count() == rows0 - 1, "account is gone from the list")
    check("Board email removed" in pg.locator(".toasts").inner_text(), "toast confirms, with Undo")
    pg.evaluate("location.hash='inbox'"); pg.wait_for_timeout(300)
    check(pg.locator(".mail-row", has_text="Audit Committee Chair").count() == 0, "its mail is deleted from the inbox")
    pg.evaluate("location.hash='connections'"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='inbox'"); pg.wait_for_timeout(300)
    # Undo is on the toast (it may have been replaced by navigation), so undo from a fresh removal instead
    pg.evaluate("location.hash='connections'"); pg.wait_for_timeout(300)

    # 2. remove but keep the data, then Undo straight away
    pg.get_by_role("button", name="Remove Seef Studio email").click(); pg.wait_for_timeout(200)
    pg.uncheck("#rm-data")
    pg.locator(".modal").get_by_role("button", name="Remove account").click(); pg.wait_for_timeout(250)
    pg.locator(".toasts").get_by_role("button", name="Undo").click(); pg.wait_for_timeout(250)
    check(pg.locator(".acct-row", has_text="Seef Studio email").count() == 1, "Undo brings the account back")

    # 3. remove from the edit dialog; the job page card goes back to Connect
    pg.get_by_role("button", name="Edit Dilmun Advisory email").click(); pg.wait_for_timeout(200)
    pg.locator(".modal").get_by_role("button", name="Remove account").click(); pg.wait_for_timeout(200)
    check("Remove Dilmun Advisory email?" in pg.locator(".modal").inner_text(), "edit dialog leads to the same confirmation")
    pg.locator(".modal").get_by_role("button", name="Remove account").click(); pg.wait_for_timeout(250)
    check(pg.locator(".modal").count() == 0, "both dialogs close")
    pg.evaluate("location.hash='pg_j2'"); pg.wait_for_timeout(400)
    mail_card = pg.locator("section.card", has_text="Connect an email account")
    check(mail_card.count() == 1 and mail_card.get_by_role("button", name="Connect account").count() == 1, "the job's mail card asks to connect again")

    # 4. live account: tells you how to stop Mosaic using the connector
    pg.evaluate("location.hash='connections'"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Add account").first.click(); pg.wait_for_timeout(200)
    pg.locator(".modal .app-choice", has_text="Google Drive").click(); pg.check("#cw-job-j1")
    pg.get_by_role("button", name="Continue", exact=True).click()
    pg.get_by_role("button", name="Connect Google Drive").click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Done", exact=True).click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Remove University Drive").click(); pg.wait_for_timeout(200)
    txt = pg.locator(".modal").inner_text()
    check("doesn't keep copies" in txt and pg.locator("#rm-data").count() == 0, "live account: nothing stored to delete, explains claude.ai side")
    pg.locator(".modal").get_by_role("button", name="Open permissions").click(); pg.wait_for_timeout(200)
    check(pg.evaluate("!!window.__permOpened"), "Open permissions opens the page's permissions")
    shot(pg, "live")
    pg.locator(".modal").get_by_role("button", name="Cancel").click(); pg.wait_for_timeout(150)

    # 5. remove all demo accounts at once
    btn = pg.get_by_role("button", name="Remove all demo accounts")
    check(btn.count() == 1, "there's a button to remove all demo accounts")
    btn.click(); pg.wait_for_timeout(200)
    shot(pg, "all")
    check("calendar events" in pg.locator(".modal").inner_text(), "bulk removal lists the sample data that goes with them")
    pg.locator(".modal").get_by_role("button", name="Remove 9 accounts").or_(pg.locator(".modal .btn.danger-fill")).first.click(); pg.wait_for_timeout(300)
    check(pg.locator(".acct-row").count() == 1 and pg.locator(".acct-row", has_text="University Drive").count() == 1, "only the live account is left")
    check(pg.get_by_role("button", name="Remove all demo accounts").count() == 0, "the bulk button disappears when no demo accounts remain")
    pg.evaluate("location.hash='inbox'"); pg.wait_for_timeout(300)
    check(pg.locator(".mail-row").count() == 0, "sample mail is gone")
    pg.evaluate("location.hash='home'"); pg.wait_for_timeout(400)
    shot(pg, "home-after")
    b.close()

print("\n".join(notes)); print("errors:", errors or "none")
print("FAILED" if any(n.startswith("FAIL") for n in notes) or errors else "ALL PASSED")
