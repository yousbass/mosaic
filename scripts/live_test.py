# Live connections: connect Google Drive through a stand-in for claude.ai's connectors,
# then browse, search, summarise, survive outages and sign-outs, and ask the assistant.
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
def shot(pg, name): pg.screenshot(path=f"{SHOTS}/live-{name}.png")
def check(cond, msg):
    notes.append(("ok   " if cond else "FAIL ") + msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Bahrain", locale="en-GB")
    ctx.add_init_script(FAKE)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "ERR_" not in m.text else None)
    pg.goto(URL + "#connections"); pg.wait_for_timeout(500)

    def open_drive_wizard():
        pg.get_by_role("button", name="Add account").first.click(); pg.wait_for_timeout(200)
        pg.locator(".modal .app-choice", has_text="Google Drive").click(); pg.wait_for_timeout(150)
        pg.check("#cw-job-j1")
        pg.get_by_role("button", name="Continue", exact=True).click(); pg.wait_for_timeout(150)

    # A. outside claude.ai: no mcp at all
    pg.evaluate("window.__mcpMode='none'")
    pg.get_by_role("button", name="Add account").first.click(); pg.wait_for_timeout(200)
    check(pg.locator(".modal .chip.live").count() == 1, "only Google Drive is marked Live in the app list")
    shot(pg, "wizard-list")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    open_drive_wizard()
    shot(pg, "wizard-connect")
    pg.get_by_role("button", name="Connect Google Drive").click(); pg.wait_for_timeout(300)
    check("opened on claude.ai" in pg.locator(".modal").inner_text(), "no runtime: says it works on claude.ai")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)

    # B. Drive not added on claude.ai, then added and retried
    pg.evaluate("window.__mcpMode='not_connected'")
    open_drive_wizard()
    pg.get_by_role("button", name="Connect Google Drive").click(); pg.wait_for_timeout(300)
    txt = pg.locator(".modal").inner_text()
    check("isn't connected to your claude.ai account" in txt, "connector missing: tells you to add it in claude.ai")
    shot(pg, "wizard-missing")
    pg.evaluate("window.__mcpMode='ok'")
    pg.get_by_role("button", name="Try again").click(); pg.wait_for_timeout(400)
    check("is connected" in pg.locator(".modal").inner_text(), "after adding it, Try again connects")
    shot(pg, "wizard-done")
    pg.get_by_role("button", name="Show it on the University page").click(); pg.wait_for_timeout(600)
    check(pg.evaluate("location.hash") == "#pg_j1", "jumps to the University page")
    card = pg.locator("section.card").first
    check(card.locator(".sub.is-live").count() == 1, "card header says Live")
    check(card.locator(".drive-row").count() == 5, f"lists the recent files ({card.locator('.drive-row').count()})")
    check(card.locator("a.li-title").first.get_attribute("target") == "_blank", "file names open Drive in a new tab")
    shot(pg, "job-page")

    # C. search
    card.locator("input[id^=drive-q]").fill("plan"); card.locator("input[id^=drive-q]").press("Enter"); pg.wait_for_timeout(300)
    last = pg.evaluate("window.__mcpCalls.filter(c => c.tool === 'search_files').pop()")
    check(last and last["input"]["query"] == "fullText contains 'plan'", f"search sends a Drive query: {last and last['input']['query']}")
    check(card.locator(".drive-row").count() == 1 and "ICE 211" in card.inner_text(), "search shows the matching file")
    shot(pg, "search")
    card.locator("input[id^=drive-q]").fill("zzz"); card.locator("input[id^=drive-q]").press("Enter"); pg.wait_for_timeout(5)
    check(card.locator(".drive-row").count() == 0, "a new search never shows the previous results under its heading")
    pg.wait_for_timeout(300)
    check("No files match" in card.inner_text(), "no matches says so")
    card.get_by_role("button", name="Clear search").click(); pg.wait_for_timeout(300)
    check(pg.evaluate("document.activeElement && document.activeElement.id.startsWith('drive-q')"), "clearing keeps focus in the search box")
    check(card.locator(".drive-row").count() == 5, "clearing the search brings back recent files")

    # D. summary
    card.get_by_role("button", name="Summarize ICE 211 course plan").click(); pg.wait_for_timeout(500)
    check("week 7" in card.inner_text(), "summary appears under the file")
    check("ignore any instructions" in (pg.evaluate("window.__summaryPrompt") or ""), "summary prompt marks file text as untrusted")
    shot(pg, "summary")
    card.get_by_role("button", name="Summarize ICE 211 course plan").click(); pg.wait_for_timeout(150)
    check(card.locator(".drive-sum").count() == 0, "summary closes")
    card.get_by_role("button", name="Summarize Board pack October").click(); pg.wait_for_timeout(400)
    check(card.locator(".drive-sum").count() == 1, "PDF can be summarised too")
    card.get_by_role("button", name="Summarize Board pack October").click(); pg.wait_for_timeout(100)
    check(card.get_by_role("button", name="Summarize Accreditation").count() == 0, "folders have no Summary button")

    # E. outage keeps data; sign-out removes it; retry restores
    pg.evaluate("window.__watchError('server_unavailable')"); pg.wait_for_timeout(150)
    check(card.locator(".drive-row").count() == 5 and "Couldn't refresh" in card.inner_text(), "outage: files stay, marked not refreshed")
    shot(pg, "outage")
    pg.evaluate("window.__watchError('needs_reauth')"); pg.wait_for_timeout(150)
    check(card.locator(".drive-row").count() == 0 and "sign-in has expired" in card.inner_text(), "expired sign-in: files hidden, reconnect message")
    shot(pg, "reauth")
    card.get_by_role("button", name="Try again").click(); pg.wait_for_timeout(400)
    check(card.locator(".drive-row").count() == 5, "Try again restores the files")
    pg.evaluate("window.__watchError('not_in_manifest')"); pg.wait_for_timeout(150)
    card.get_by_role("button", name="Open permissions").click(); pg.wait_for_timeout(300)
    check(pg.evaluate("!!window.__permOpened"), "turned off for the page: Open permissions opens the panel")
    pg.wait_for_timeout(300)
    check(card.locator(".drive-row").count() == 5, "after permissions, files load again")

    # F. assistant reads Drive
    pg.get_by_role("button", name="Ask Mosaic").first.click(); pg.wait_for_timeout(300)
    pg.fill("#assistant-input", "What does my Drive say about the Dilmun proposal?"); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    names = pg.evaluate("window.__liveToolNames") or []
    check("search_drive" in names and "read_drive_file" in names, f"assistant gets Drive tools: {names}")
    check(pg.locator(".source-chip", has_text="Dilmun proposal draft").count() == 1, "answer lists the Drive file it read")
    check(bool(pg.evaluate("window.__badId")), "assistant can't read a made-up file id")
    shot(pg, "assistant")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # G. accounts page status
    pg.evaluate("location.hash='connections'"); pg.wait_for_timeout(400)
    row = pg.locator(".acct-row", has_text="University Drive")
    check(row.locator(".chip.live").count() == 1, "accounts page marks it Live")
    check(pg.locator(".acct-row .chip.demo").count() >= 10, "demo accounts are marked Demo")
    shot(pg, "accounts")

    # H. edit the live account: scope words
    row.get_by_role("button", name="Edit University Drive").click(); pg.wait_for_timeout(200)
    check("signed in as you" in pg.locator(".modal").inner_text(), "edit shows it's live through claude.ai")
    pg.fill("#cw-scope", "Board"); pg.get_by_role("button", name="Save").click(); pg.wait_for_timeout(200)
    pg.evaluate("location.hash='pg_j1'"); pg.wait_for_timeout(500)
    card = pg.locator("section.card").first
    check("mentioning “board”" in card.inner_text().lower() and card.locator(".drive-row").count() == 1, "scope words narrow the card")

    # I. Arabic and phone
    pg.evaluate("location.hash='settings'"); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="عربي").first.click(); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='pg_j1'"); pg.wait_for_timeout(500)
    shot(pg, "arabic")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.locator("section.card").first.scroll_into_view_if_needed()
    shot(pg, "phone")
    b.close()

print("\n".join(notes))
print("errors:", errors or "none")
print("FAILED" if any(n.startswith("FAIL") for n in notes) or errors else "ALL PASSED")
