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


def test_first_visit_opens_program_chooser(open_page):
    page = open_page()
    assert page.evaluate("state.view") == "list" and page.is_visible(".chooser")
    # the chooser's search narrows the list
    page.fill(".chooser-search", "פיזיקה")
    shown = page.locator(".chooser-item:visible").all_inner_texts()
    assert shown and all("פיזיקה" in n for n in shown)
    page.get_by_role("button", name="רק לעיין בקורסים").click()
    assert page.evaluate("[state.view, state.scope]") == ["map", "unit"] and page.is_hidden("#sheet")
    assert page.errors == []


def test_default_view_renders(open_page):
    page = open_page(UNIT)
    assert page.evaluate("cy.nodes().length") > 20
    assert page.evaluate("cy.edges().length") > 20
    assert page.locator(".band-label").count() >= 3
    assert page.errors == []


def test_click_opens_details_and_highlights(open_page):
    page = open_page(UNIT)
    click_node(page, "03661102")
    page.wait_for_selector("#details:not([hidden])")
    assert "חשבון דיפרנציאלי ואינטגרלי 2א" in page.inner_text("#details h2")
    assert page.evaluate("cy.getElementById('03661101').hasClass('hl')")
    assert "course=03661102" in page.url
    assert page.is_hidden("#hint")  # the tip goes once used


def test_search_by_course_number(open_page):
    page = open_page(UNIT)
    page.fill("#search", "0366-1112")
    page.keyboard.press("Enter")
    page.wait_for_selector("#details:not([hidden])")
    assert "אלגברה לינארית 2א" in page.inner_text("#details h2")


def test_program_view(open_page):
    page = open_page("#program=תוכנית חד-חוגית בפיזיקה&view=map")
    assert page.is_hidden("#sheet")
    labels = page.locator(".band-label").all_inner_texts()
    assert re.match(r"שנה א׳\s+סמסטר א׳", labels[0])
    assert page.evaluate("cy.getElementById('03211111').hasClass('required')")
    # Band labels sit above the graph canvas, so clicking one opens that part's rules
    page.locator("button.band-label").nth(1).click()
    page.wait_for_selector("#details:not([hidden])")
    assert page.evaluate("state.info.type") == "category"
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
    # a prerequisite outside the data (e.g. no longer offered) is marked as passed in the card
    cid, ext = open_page().evaluate(
        "(() => { for (const c of COURSES.values()) { const e = reqIds(c.req).find(i => DATA.external[i]); if (e) return [c.id, e]; } })()")
    page = open_page(f"#course={cid}")
    name = page.evaluate(f"DATA.external['{ext}']")
    page.locator("#details label.external", has_text=name).first.locator("input").check()
    assert page.evaluate(f"state.taken.has('{ext}')")
    assert ext in page.evaluate("store.get(STORAGE_KEY, [])")
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


CS = "תוכנית חד-חוגית במדעי המחשב"
UNIT = "#unit=מתמטיקה"


def test_planning_across_semesters(open_page):
    page = open_page(f"#program={CS}&view=timeline")
    first, second = page.evaluate("planSemesters().slice(0, 2)")
    page.evaluate(f"setPlan('03661101', '{first}')")
    page.evaluate(f"setPlan('03661112', '{second}')")
    assert page.evaluate(f"planIssues('03661101', '{first}')") == []
    # Calculus 2 in the next semester: prerequisite planned earlier, co-requisite planned alongside
    page.evaluate(f"setPlan('03661102', '{second}')")
    assert page.evaluate(f"planIssues('03661102', '{second}')") == []
    # ...but not in the same semester as its prerequisite: flagged in the semesters view and on the map
    page.evaluate(f"setPlan('03661102', '{first}')")
    issues = page.evaluate(f"planIssues('03661102', '{first}')")
    assert any(i.startswith("חסר") for i in issues)
    assert page.locator(".term-item.invalid", has_text="חשבון דיפרנציאלי ואינטגרלי 2א").count() == 1
    issues = page.evaluate("[...state.plan].filter(([id, sem]) => planIssues(id, sem).length).length")
    assert f"{issues} בעיות בתכנון" in page.inner_text("#summary")
    assert page.evaluate("cy.getElementById('03661102').hasClass('invalid')")
    # Adding from a semester column offers the program's courses that semester
    page.evaluate("setPlan('03661102', null)")
    page.click(".terms .term:nth-child(2) .term-add .picker-btn")
    page.click('.picker-pop:not([hidden]) [role=option][data-value="03661102"]')
    assert page.evaluate(f"state.plan.get('03661102')") == second
    assert page.errors == []


def pick(page, picker, value):
    page.click(picker)
    page.click(f'.picker-pop:not([hidden]) [role=option][data-value="{value}"]')


def click_node(page, course_id):
    x, y = page.evaluate(f"(() => {{ const p = cy.getElementById('{course_id}').renderedPosition(); return [p.x, p.y]; }})()")
    box = page.locator("#cy").bounding_box()
    page.mouse.click(box["x"] + x, box["y"] + y)


def test_degree_checklist(open_page):
    page = open_page(f"#program={CS}")
    assert page.is_visible("#sheet") and "/ 128" in page.inner_text("#summary")
    first = page.locator(".cat").first
    ids = page.evaluate("view.cats.find(c => c.year === 1 && c.sem === 1 && c.required).courses")
    credits = page.evaluate(f"creditsOf({ids})")
    first.get_by_role("button", name="סימון הכל כעבר").click()
    assert page.evaluate(f"{ids}.every(id => state.taken.has(id))")
    assert page.locator(".cat").first.evaluate("e => e.classList.contains('complete')")
    assert page.inner_text("#summary .summary-total b") == str(credits)
    # "שאר רוח" has no course list: its credits are entered by hand and count toward the degree
    page.fill(".cat-body.manual input", "6")
    page.locator(".cat-body.manual input").dispatch_event("change")
    assert page.inner_text("#summary .summary-total b") == str(credits + 6)
    # A part completed now stays open for its grades; on the next visit it starts folded, and opens on a click
    assert page.locator(".cat").first.locator(".row").count() == len(ids)
    page.reload()
    page.wait_for_selector("#status.done")
    assert page.locator(".cat").first.locator(".row").count() == 0
    page.locator(".cat").first.locator(".cat-toggle").click()
    assert page.locator(".cat").first.locator(".row").count() == len(ids)
    assert page.errors == []


def test_grades_weighted_average(open_page):
    page = open_page(f"#program={CS}")
    ids = page.evaluate("view.cats.find(c => c.year === 1 && c.sem === 1 && c.required).courses")
    page.evaluate(f"markTaken({ids})")
    grades = [92, 85, 78, 88]
    for cid, g in zip(ids, grades):
        page.fill(f'.row input.grade[data-course="{cid}"]', str(g))
        page.locator(f'.row input.grade[data-course="{cid}"]').dispatch_event("change")
    credits = page.evaluate(f"{ids}.map(id => COURSES.get(id).credits)")
    expected = sum(g * c for g, c in zip(grades, credits)) / sum(credits)
    assert f"{expected:.1f}" in page.inner_text("#summary")
    assert page.evaluate("store.get(GRADES_KEY, {})")[ids[0]] == 92
    # Unmarking a course drops its grade
    page.evaluate(f"toggleTaken('{ids[0]}')")
    assert ids[0] not in page.evaluate("store.get(GRADES_KEY, {})")
    assert page.errors == []


def test_joint_program_checklist(open_page):
    # Joint programs come without catalog credit figures or sections
    page = open_page("#program=תוכנית דו-חוגית במתמטיקה ובמדעי המחשב")
    assert "false" not in page.inner_text("#summary")
    cat = page.evaluate("view.cats.find(isMandatory)")
    page.evaluate(f"markTaken({cat['courses']})")
    assert page.locator(".cat.complete").count() >= 1
    assert page.evaluate("store.get(PROGRAM_KEY, '')") == "תוכנית דו-חוגית במתמטיקה ובמדעי המחשב"  # opened from a link
    assert page.errors == []


def test_checklist_keeps_place_while_recording(open_page):
    page = open_page(f"#program={CS}")
    fold = page.locator("details.more").first
    fold.locator("summary").click()
    row = fold.locator(".row").first
    name = row.locator(".course-link").inner_text()
    row.locator("input[type=checkbox]").check()
    assert page.locator("details.more").first.evaluate("e => e.open")  # the opened list stays open
    assert page.locator("details.more").first.locator(".row").first.locator(".course-link").inner_text() == name
    assert page.evaluate("document.activeElement.type") == "checkbox"
    # An impossible grade is kept on screen as invalid, not saved or silently erased
    cid = page.evaluate("[...state.taken][0]")
    grade = page.locator(f'.row input.grade[data-course="{cid}"]').first
    grade.fill("150")
    grade.dispatch_event("change")
    assert not page.evaluate(f"state.grades.has('{cid}')")
    assert grade.evaluate("e => e.matches(':invalid')")
    assert page.errors == []


def test_map_click_opens_card_with_progress(open_page):
    page = open_page(f"#program={CS}&view=map")
    page.evaluate("toggleTaken('03661101')")
    assert page.evaluate("cy.getElementById('03661101').hasClass('taken')")
    click_node(page, "03661101")  # clicking always opens the card; recording happens in it
    page.wait_for_selector("#details:not([hidden])")
    assert page.evaluate("state.taken.has('03661101')")
    assert page.locator("#details input.grade").count() == 1


def test_faculty_and_program_choice(open_page):
    page = open_page("#program=")
    first = page.evaluate("programFaculties()[0].value")
    assert page.locator(".chooser-item").count() == page.evaluate(
        f"Object.keys(DATA.programs).filter(n => programFaculty(n) === {first!r}).length")
    page.locator(".chooser .chip", has_text="מדעים מדויקים").click()
    page.get_by_role("button", name="פיזיקה", exact=True).click()
    page.wait_for_function("state.program === 'תוכנית חד-חוגית בפיזיקה'")  # loads the program first
    assert "חד-חוגית בפיזיקה" in page.inner_text(".page-head h1")
    # A returning student lands on their degree
    page.goto(page.url.split("#")[0])
    page.wait_for_selector("#status.done")
    assert page.evaluate("state.view === 'list' && state.program === 'תוכנית חד-חוגית בפיזיקה'")
    # The program's title opens the chooser: another faculty lists only its own programs...
    page.click(".program-switch")
    dialog = page.locator("#programDialog")
    other = page.evaluate("programFaculties()[1].value")
    dialog.locator(".chip", has_text=other).click()
    names = dialog.locator(".chooser-item").all_inner_texts()
    expected = page.evaluate(f"programOptions.filter(o => programFaculty(o.value) === {other!r}).map(o => o.label)")
    assert names and names == expected
    # ...and the search looks through every faculty
    dialog.locator(".chooser-search").fill("משפטים")
    first = dialog.locator(".chooser-item").first
    law = first.inner_text()
    assert "משפטים" in law
    first.click()
    page.wait_for_function("!document.getElementById('programDialog').open && state.program.includes('משפטים')")
    assert page.evaluate("shortProgram(state.program)") == law
    assert page.errors == []


def test_tabs_and_map_scope(open_page):
    page = open_page(f"#program={CS}")
    page.click("#tabs [data-view=map]")
    assert page.evaluate("[state.view, state.scope]") == ["map", "program"] and page.is_hidden("#sheet")
    assert page.evaluate("cy.nodes().every(n => view.categories.has(n.id()))")  # the program's courses
    page.click("#scopeUnit")
    assert "unit=" in page.url and page.is_visible("#deptBar")
    # the program stays the context of the other tabs
    page.click("#tabs [data-view=timeline]")
    assert page.is_visible(".timeline") and page.evaluate("state.program") == CS
    # switching tabs keeps the open course card
    page.evaluate("select('03661101')")
    page.click("#tabs [data-view=list]")
    assert page.is_visible("#details") and page.evaluate("state.selected") == "03661101"
    assert page.errors == []


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
    # the selected course stays on screen, above the bottom sheet (once the zoom to it has finished)
    page.wait_for_function("!cy.animated()")
    x, y = page.evaluate("(() => { const p = cy.getElementById('03661102').renderedPosition(); return [p.x, p.y]; })()")
    top = page.locator("#cy").bounding_box()["y"]
    assert 0 < x < width and top < top + y < page.locator("#details").bounding_box()["y"]


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
    page.evaluate("state.grades.set('03661101', 90); saveProgress(); store.set(UPDATED_KEY, 2000)")
    page.evaluate(FAKE_CLOUD, {"taken": ["03661111"], "plan": {"03661102": first, "03661112": first},
                               "program": "", "updatedAt": 1000, "grades": {"03661111": 80}})
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User', email: 't@example.com' })")
    page.wait_for_function("cloud.status === 'מסונכרן'")
    # First sync merges: union of passed courses, the newer (local) side wins the planned conflict
    assert sorted(page.evaluate("[...state.taken]")) == ["03661101", "03661111"]
    assert page.evaluate("Object.fromEntries(state.plan)") == {"03661102": second, "03661112": first}
    assert page.evaluate("window.fake.remote.taken.length") == 2
    assert page.evaluate("Object.fromEntries(state.grades)") == {"03661101": 90, "03661111": 80}
    assert page.evaluate("window.fake.remote.grades") == {"03661101": 90, "03661111": 80}
    assert page.is_visible("#accountBtn") and "Test" in page.inner_text("#accountBtn")

    # Edits are pushed to the account
    page.evaluate("toggleTaken('03661105')")
    page.wait_for_function("window.fake.remote.taken.includes('03661105')")

    # On a later load, a newer remote copy replaces the device copy (so removals propagate)
    page.evaluate("window.fake.remote = { taken: ['03661101'], plan: {}, program: '', updatedAt: Date.now() + 1e6 }")
    page.evaluate("onCloudUser({ uid: 'u1', name: 'Test User' })")
    page.wait_for_function("cloud.status === 'מסונכרן' && state.taken.size === 1")
    assert page.evaluate("state.plan.size") == 0

    # A copy saved by an older version (no grades field) keeps the device's grades
    page.evaluate("state.taken.add('03661101'); state.grades.set('03661101', 95)")
    page.evaluate("applyProgress({ taken: ['03661101'], plan: {}, program: '', updatedAt: 1 })")
    assert page.evaluate("state.grades.get('03661101')") == 95

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
    previous = page.evaluate("Object.keys(DATA.programs[state.program].previous).sort().reverse()[0]")
    pick(page, "#startYear", previous)
    assert page.evaluate("view.program.year") == previous != current
    assert f"start={previous}" in page.url
    # planner semesters are labelled with the student's year of study
    first = page.evaluate("planSemesters()[0]")
    assert "שנה ב׳" in page.evaluate(f"semOption('{first}')")
    assert page.errors == []


def test_bulk_changes_can_be_undone(open_page):
    page = open_page(f"#program={CS}")
    page.locator(".cat").first.get_by_role("button", name="סימון הכל כעבר").click()
    assert page.evaluate("state.taken.size") > 0
    page.locator("#toast").get_by_role("button", name="ביטול").click()
    assert page.evaluate("state.taken.size") == 0 and page.is_hidden("#toast")
    page.evaluate("markTaken(['03661101'])")
    page.get_by_role("button", name="מחיקת כל הסימונים").click()
    assert page.evaluate("state.taken.size") == 0
    page.locator("#toast").get_by_role("button", name="ביטול").click()
    assert page.evaluate("state.taken.has('03661101')")
    assert page.errors == []


def test_phone_checklist(open_page):
    page = open_page(f"#program={CS}", width=390, height=844)
    # one header row on top; the tabs sit at the bottom
    assert page.locator(".topbar").bounding_box()["height"] <= 56
    assert page.locator("#tabs").bounding_box()["y"] > 844 - 70
    # the semester picker at the row's far end opens fully on screen, not squeezed
    page.locator(".row:not(.done) .row-status .picker-btn").first.click()
    pop = page.locator(".picker-pop:not([hidden])").bounding_box()
    assert pop["x"] >= 8 and pop["width"] > 120
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_graph_keyboard_navigation(open_page):
    page = open_page(UNIT)
    page.focus("#cy")
    page.keyboard.press("ArrowDown")
    first = page.evaluate("state.selected")
    assert first and page.is_visible("#details")
    page.keyboard.press("ArrowDown")
    second = page.evaluate("state.selected")
    assert second != first
    assert page.evaluate(f"cy.getElementById('{second}').position('y') > cy.getElementById('{first}').position('y')")


def test_program_map_electives(open_page):
    page = open_page(f"#program={CS}&view=map")
    assert page.is_hidden("#filtersBtn")
    few = page.evaluate("cy.nodes().length")
    page.click("#electivesBtn")
    assert page.evaluate("cy.nodes().length") > few
    page.click("#electivesBtn")
    # a passed elective stays on the map without the others
    elective = page.evaluate("view.cats.find(c => !c.required).courses.find(id => COURSES.has(id))")
    page.evaluate(f"toggleTaken('{elective}')")
    assert page.evaluate(f"cy.getElementById('{elective}').length") == 1
    assert page.errors == []
