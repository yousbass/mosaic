# Screenshot every main screen at desktop and phone widths, light and dark, and collect page errors.
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROOT_URL = (ROOT / "dist" / "test.html").as_uri()
SHOTS = ROOT / "shots2"
SHOTS.mkdir(exist_ok=True)
import sys
from playwright.sync_api import sync_playwright
URL = ROOT_URL
errors = []
views = sys.argv[1].split(",") if len(sys.argv) > 1 else ["home", "pg_j1", "pg_j2", "pg_j4", "inbox", "calendar", "tasks", "tenders", "reports", "connections", "settings"]
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme, (w, h), tag in [("light", (1440, 1500), "desk"), ("dark", (390, 844), "phone")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, timezone_id="Asia/Bahrain", locale="en-GB")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e, tag=tag: errors.append(f"[{tag}] pageerror: {e}"))
        pg.on("console", lambda m, tag=tag: errors.append(f"[{tag}] {m.type}: {m.text}") if m.type == "error" and "ERR_" not in m.text else None)
        for v in views:
            pg.goto(URL + "#" + v); pg.reload(); pg.wait_for_timeout(450)
            pg.screenshot(path=f"{SHOTS}/{tag}-{v}.png", full_page=(tag == "desk"))
            if pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"): errors.append(f"[{tag}] horizontal scroll on {v}")
        ctx.close()
    b.close()
print("\n".join(errors) or "NO ERRORS")
