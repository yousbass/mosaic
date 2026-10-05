# Sending for real: a reply from a Gmail account opens Gmail's compose window, pre-filled, in that account.
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_URL = (ROOT / "dist" / "test.html").as_uri()
SHOTS = ROOT / "shots2"
SHOTS.mkdir(exist_ok=True)
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
FAKE = open(HERE / "fake_ai.js").read() + "\n" + open(HERE / "fake_live.js").read()
URL = ROOT_URL
errors, notes = [], []
def check(cond, msg): notes.append(("ok   " if cond else "FAIL ") + msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Bahrain", locale="en-GB",
                        permissions=["clipboard-read", "clipboard-write"])
    ctx.add_init_script(FAKE)
    ctx.route("https://**/*", lambda r: r.fulfill(status=200, body="<title>stub</title>stub"))  # no real mail service in tests
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(URL + "#inbox"); pg.wait_for_timeout(500)

    # Reply to a mail that arrived in the Gmail account (Board email)
    pg.locator(".mail-row", has_text="Audit Committee Chair").click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Reply with AI").click(); pg.wait_for_timeout(200)
    check(pg.input_value("#mail-from") == "a3", "reply is sent from the account the mail came to")
    pg.fill("#mail-body", "Dear Chair,\n\nMy question: what is the timeline for the procurement fixes?\n\nBest regards,")
    send = pg.get_by_role("link", name="Send with Gmail")
    check(send.count() == 1, "Send says which service sends it")
    with ctx.expect_page() as popup:
        send.click()
    page2 = popup.value
    u = urlparse(page2.url); qs = parse_qs(u.query)
    check(u.netloc == "mail.google.com" and "/mail/u/you.personal%40gmail.com/" in u.path, f"opens Gmail in that account: {u.netloc}{u.path}")
    check(qs.get("tf") == ["cm"] and qs.get("to") == ["chair.audit@pearlcoast.bh"], "compose window has the recipient")
    check(qs.get("su", [""])[0].startswith("Re: Internal audit report"), "and the subject")
    check("procurement fixes" in qs.get("body", [""])[0], "and the message")
    page2.close(); pg.wait_for_timeout(300)
    check("Press Send there" in pg.locator(".toasts").inner_text(), "Mosaic says to press Send in Gmail")
    pg.get_by_role("tab", name="Sent").or_(pg.get_by_role("button", name="Sent")).first.click(); pg.wait_for_timeout(200)
    check(pg.locator(".mail-row", has_text="Via Gmail").count() == 1, "Sent list shows it went via Gmail")

    # Outlook work account and Yahoo
    pg.get_by_role("button", name="New email").click(); pg.wait_for_timeout(200)
    pg.select_option("#mail-from", "a2")
    pg.fill("#mail-to", "omar@alnoorlogistics.bh"); pg.fill("#mail-subject", "Data list"); pg.fill("#mail-body", "Thanks Omar.")
    href = pg.get_by_role("link", name="Send with Outlook").get_attribute("href")
    check(href.startswith("https://outlook.office.com/mail/deeplink/compose?"), "work Outlook account uses Outlook on the web")
    pg.select_option("#mail-from", "a4")
    href = pg.get_by_role("link", name="Send with Yahoo Mail").get_attribute("href")
    check(href.startswith("https://compose.mail.yahoo.com/?"), "Yahoo account uses Yahoo's compose page")
    pg.fill("#mail-body", "")
    check(pg.get_by_role("button", name="Send with Yahoo Mail").is_disabled(), "Send waits for a message")
    pg.keyboard.press("Escape")

    # Arabic label
    pg.evaluate("location.hash='settings'"); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="عربي").first.click(); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='inbox'"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="بريد جديد").click(); pg.wait_for_timeout(200)
    pg.fill("#mail-to", "a@b.bh"); pg.fill("#mail-subject", "x"); pg.fill("#mail-body", "y")
    check(pg.locator(".modal a.btn.primary").inner_text().strip().startswith("أرسل عبر"), "Arabic: أرسل عبر …")
    pg.screenshot(path=f"{SHOTS}/send-ar.png")
    b.close()

print("\n".join(notes)); print("errors:", errors or "none")
print("FAILED" if any(n.startswith("FAIL") for n in notes) or errors else "ALL PASSED")
