"""Browser tests for the site (Playwright + Chromium: `playwright install chromium-headless-shell`)."""

import functools
import re
import http.server
import threading
from pathlib import Path

import pytest

sync_api = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def base_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *args: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/"
    server.shutdown()


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def open_page(browser, base_url):
    pages = []

    def _open(hash_="", width=1440, height=900):
        page = browser.new_page(viewport={"width": width, "height": height})
        page.errors = []
        page.on("pageerror", lambda e: page.errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
        # Never talk to the live Firebase project from tests; sync is tested with a fake backend
        page.route("**/assets/firebase-config.js", lambda route: route.fulfill(
            content_type="application/javascript", body="window.FIREBASE_CONFIG = null;"))
        page.goto(base_url + hash_)
        page.wait_for_selector("#status.done", timeout=20000)
        pages.append(page)
        return page

    yield _open
    for page in pages:
        page.close()


def test_default_view_renders(open_page):
    page = open_page()
    assert page.evaluate("cy.nodes().length") > 20
    assert page.evaluate("cy.edges().length") > 20
    assert page.locator(".band-label").count() >= 3
    assert page.errors == []


def test_click_opens_details_and_highlights(open_page):
    page = open_page()
    click_node(page, "03661102")
    page.wait_for_selector("#details:not([hidden])")
    assert "חשבון דיפרנציאלי ואינטגרלי 2א" in page.inner_text("#details h2")
    assert page.evaluate("cy.getElementById('03661101').hasClass('hl')")
    assert "course=03661102" in page.url


def test_search_by_course_number(open_page):
    page = open_page()
    page.fill("#search", "0366-1112")
    page.keyboard.press("Enter")
    page.wait_for_selector("#details:not([hidden])")
    assert "אלגברה לינארית 2א" in page.inner_text("#details h2")


def test_program_view(open_page):
    page = open_page("#program=תוכנית חד-חוגית בפיזיקה")
    labels = page.locator(".band-label").all_inner_texts()
    assert labels[0].startswith("שנה א׳ · סמסטר א׳")
    assert page.evaluate("cy.getElementById('03211111').hasClass('required')")
    assert page.errors == []


def test_prerequisite_logic(open_page):
    page = open_page()
    can = "canTake(COURSES.get('{}'), state.taken)".format
    page.evaluate("state.taken = new Set()")
    assert not page.evaluate(can("03661102"))
    page.evaluate("state.taken.add('03661101')")
    assert page.evaluate(can("03661102"))  # a co-requisite doesn't block
    page.evaluate("state.taken = new Set(['03211118', '03211838', '03211839'])")
    assert not page.evaluate(can("03212105"))  # still needs one of an "any" group
    page.evaluate("state.taken.add('03661111')")
    assert page.evaluate(can("03212105"))
    # An alternative outside the dataset counts only once marked as passed
    page.evaluate("state.taken = new Set(['03682159'])")
    assert not page.evaluate(can("03683065"))  # (03682162 or 05124402) + (03682159 or 05124400)
    page.evaluate("state.taken.add('05124402')")
    assert page.evaluate(can("03683065"))
    # ...while an external course that is simply required counts as met
    assert page.evaluate("trackable({all: ['03661101', '99999999']}, COURSES)") == "03661101"


def test_external_prerequisite_can_be_marked(open_page):
    page = open_page("#course=03683065")
    name = page.evaluate("DATA.external['05124402']")
    page.locator("#details label.external", has_text=name).first.locator("input").check()
    assert page.evaluate("state.taken.has('05124402')")
    assert "05124402" in page.evaluate("store.get(STORAGE_KEY, [])")
    assert page.errors == []


def test_shared_courses_count_once(open_page):
    page = open_page("#program=תוכנית חד-חוגית במדעי המחשב")
    done = """(() => { const got = allocateCredits(view.cats);
        return Object.fromEntries(view.cats.filter(c => /קורסי ליבה/.test(c.name)).map(c => [c.year, got.get(c.i).done])); })()"""
    # A core course is listed under both the year-2 and the year-3 core, but counts once
    page.evaluate("state.taken = new Set(['03683030'])")
    assert page.evaluate(done) == {"2": 4, "3": 0}
    # Once the year-2 core is complete, further core courses count toward year 3
    page.evaluate("state.taken.add('03683049')")
    assert page.evaluate(done) == {"2": 4, "3": 4}


@pytest.mark.parametrize("date, expected", [
    ("2026-09-29", "2027a"), ("2027-01-15", "2027a"), ("2027-02-10", "2027b"),
    ("2027-07-01", "2027b"), ("2027-08-01", "2028a"),
])
def test_current_semester(open_page, date, expected):
    page = open_page()
    assert page.evaluate(f"currentSemester(new Date('{date}T12:00'))") == expected


def test_planner_plans_forward(open_page):
    page = open_page("#plan=1")
    page.wait_for_selector("#planner:not([hidden])")
    assert page.is_hidden("#details")
    # Nothing passed yet: Calculus 1 is available, Calculus 2 is one course away
    assert "חשבון דיפרנציאלי ואינטגרלי 1א" in page.inner_text("#available")
    assert "חשבון דיפרנציאלי ואינטגרלי 2א" in page.inner_text("#almost")

    first, second = page.evaluate("planSemesters().slice(0, 2)")
    page.evaluate(f"setPlan('03661101', '{first}')")
    page.evaluate(f"setPlan('03661112', '{second}')")
    assert page.evaluate(f"planIssues('03661101', '{first}')") == []
    # Calculus 2 in the next semester: prerequisite planned earlier, co-requisite planned alongside
    page.evaluate(f"setPlan('03661102', '{second}')")
    assert page.evaluate(f"planIssues('03661102', '{second}')") == []
    # ...but not in the same semester as its prerequisite
    page.evaluate(f"setPlan('03661102', '{first}')")
    issues = page.evaluate(f"planIssues('03661102', '{first}')")
    assert any(i.startswith("חסר") for i in issues)
    assert page.evaluate("cy.getElementById('03661102').hasClass('invalid')")

    # Switching the target semester re-computes what is available
    page.select_option("#target", second)
    page.evaluate("setPlan('03661102', null)")
    assert "חשבון דיפרנציאלי ואינטגרלי 2א" in page.inner_text("#available")
    assert page.errors == []


def click_node(page, course_id):
    x, y = page.evaluate(f"(() => {{ const p = cy.getElementById('{course_id}').renderedPosition(); return [p.x, p.y]; }})()")
    box = page.locator("#cy").bounding_box()
    page.mouse.click(box["x"] + x, box["y"] + y)


def test_planner_click_modes(open_page):
    page = open_page("#plan=1")
    click_node(page, "03661101")
    assert page.evaluate("state.taken.has('03661101')")
    page.get_by_role("button", name=re.compile("^מוסיפה ל")).click()
    click_node(page, "03661101")
    assert page.evaluate("state.plan.get('03661101') === state.target && !state.taken.has('03661101')")


def test_credits_add_up(open_page):
    page = open_page()
    page.evaluate("['03661101', '03661102'].forEach(id => state.taken.add(id)); renderChrome()")
    assert "14 ש״ס" in page.inner_text("#planBtn")


def test_hash_navigation(open_page):
    page = open_page()
    page.evaluate("location.hash = 'course=03661112'")
    page.wait_for_selector("#details:not([hidden])")
    assert "אלגברה לינארית 2א" in page.inner_text("#details h2")


@pytest.mark.parametrize("width", [390, 740])
def test_narrow_screens(open_page, width):
    page = open_page("#course=03661102", width=width, height=900)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.is_visible("#details")
    # the selected course stays on screen, above the bottom sheet
    x, y = page.evaluate("(() => { const p = cy.getElementById('03661102').renderedPosition(); return [p.x, p.y]; })()")
    assert 0 < x < width and 0 < y < page.locator("#details").bounding_box()["y"]


def test_accounts_hidden_without_config(open_page):
    page = open_page()
    assert page.is_hidden("#accountBtn")
    assert page.errors == []


FAKE_CLOUD = """remote => {
    window.fake = { remote, saved: [] };
    cloud.api = {
        load: async () => window.fake.remote,
        save: async d => { window.fake.saved.push(d); window.fake.remote = d; },
        remove: async () => { window.fake.remote = null; },
        signOut: async () => onCloudUser(null),
        signIn: async () => {},
    };
}"""


def test_cloud_sync(open_page):
    page = open_page()
    first, second = page.evaluate("planSemesters().slice(0, 2)")
    # Device progress before the first sign-in
    page.evaluate(f"""() => {{ state.taken = new Set(['03661101']); state.plan = new Map([['03661102', '{second}']]);
                             saveProgress(); store.set(UPDATED_KEY, 2000); }}""")
    page.evaluate(FAKE_CLOUD, {"taken": ["03661111"], "plan": {"03661102": first, "03661112": first},
                               "program": "", "updatedAt": 1000})
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User', email: 't@example.com' })")
    page.wait_for_function("cloud.status === 'מסונכרן'")
    # First sync merges: union of passed courses, the newer (local) side wins the planned conflict
    assert sorted(page.evaluate("[...state.taken]")) == ["03661101", "03661111"]
    assert page.evaluate("Object.fromEntries(state.plan)") == {"03661102": second, "03661112": first}
    assert page.evaluate("window.fake.remote.taken.length") == 2
    assert page.is_visible("#accountBtn") and "Test" in page.inner_text("#accountBtn")

    # Edits are pushed to the account
    page.evaluate("toggleTaken('03661105')")
    page.wait_for_function("window.fake.remote.taken.includes('03661105')")

    # On a later load, a newer remote copy replaces the device copy (so removals propagate)
    page.evaluate("window.fake.remote = { taken: ['03661101'], plan: {}, program: '', updatedAt: Date.now() + 1e6 }")
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User' })")
    page.wait_for_function("cloud.status === 'מסונכרן' && state.taken.size === 1")
    assert page.evaluate("state.plan.size") == 0

    # Signing out clears the device
    page.evaluate("cloudSignOut()")
    page.wait_for_function("state.taken.size === 0 && !cloud.user")
    assert "התחברות" in page.inner_text("#accountBtn")
    assert page.errors == []


def test_sign_out_keeps_pending_change(open_page):
    page = open_page()
    page.evaluate(FAKE_CLOUD, None)
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User' })")
    page.wait_for_function("cloud.status === 'מסונכרן'")
    # Signing out right after a change still saves it to the account
    page.evaluate("(async () => { toggleTaken('03661101'); await cloudSignOut(); })()")
    assert page.evaluate("window.fake.remote.taken") == ["03661101"]
    # Deleting the account data right after a change doesn't re-create it
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User' })")
    page.wait_for_function("cloud.status === 'מסונכרן'")
    page.evaluate("(async () => { window.confirm = () => true; toggleTaken('03661102'); await cloudSignOut({ deleteData: true }); })()")
    page.wait_for_timeout(1000)
    assert page.evaluate("window.fake.remote") is None
    assert page.errors == []


def test_start_year_catalog(open_page):
    page = open_page("#program=תוכנית חד-חוגית בפיזיקה")
    current = page.evaluate("view.program.year")
    previous = page.evaluate("Object.keys(DATA.plans[state.program].previous).sort().reverse()[0]")
    page.select_option("#startYear", previous)
    assert page.evaluate("view.program.year") == previous != current
    assert f"start={previous}" in page.url
    # planner semesters are labelled with the student's year of study
    first = page.evaluate("planSemesters()[0]")
    assert "שנה ב׳" in page.evaluate(f"semOption('{first}')")
    assert page.errors == []
