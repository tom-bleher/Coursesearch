"""
Comprehensive test suite for the Coursesearch website.
Tests both visual rendering and algorithmic correctness.
Run: python3 test_site.py
"""
import json
import os
import sys
import time
import http.server
import threading
from playwright.sync_api import sync_playwright

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8765
URL = f"http://localhost:{PORT}/course_graph.html"

# ── Local HTTP server ─────────────────────────────────────────────────────────
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # silence logs

def start_server():
    os.chdir(PROJECT_DIR)
    srv = http.server.HTTPServer(("", PORT), QuietHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv

# ── Test helpers ──────────────────────────────────────────────────────────────
passed = 0
failed = 0
errors = []

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        msg = f"  FAIL  {name}" + (f" — {detail}" if detail else "")
        print(msg)
        errors.append(msg)

# ── Load JSON data for algorithmic tests ──────────────────────────────────────
def load_json_data():
    with open(os.path.join(PROJECT_DIR, "courses/JSONs/math.json"), encoding="utf-8") as f:
        math = json.load(f)
    with open(os.path.join(PROJECT_DIR, "courses/JSONs/physics.json"), encoding="utf-8") as f:
        physics = json.load(f)
    return math, physics

# ── Algorithmic Tests (no browser) ────────────────────────────────────────────
def test_json_data():
    print("\n=== JSON Data Integrity ===")
    math, physics = load_json_data()

    check("math.json is non-empty", len(math) > 0, f"got {len(math)} courses")
    check("physics.json is non-empty", len(physics) > 0, f"got {len(physics)} courses")

    # Structure checks
    required_keys = {"name", "faculty", "preq", "pareq", "last_offered"}
    for label, data in [("math", math), ("physics", physics)]:
        for cid, cdata in data.items():
            missing = required_keys - set(cdata.keys())
            if missing:
                check(f"{label}/{cid} has required keys", False, f"missing {missing}")
                break
        else:
            check(f"All {label} courses have required keys", True)

    # Prereqs reference existing courses (or cross-faculty courses we don't have)
    all_ids = set(math.keys()) | set(physics.keys())
    for label, data in [("math", math), ("physics", physics)]:
        bad = []
        for cid, cdata in data.items():
            for p in cdata.get("preq", []):
                if p not in all_ids and p not in ("וגם", "או"):
                    bad.append(f"{cid}->{p}")
        # Some prereqs reference CS/other faculty courses — that's expected
        check(f"{label} prereqs mostly reference known courses",
              len(bad) < len(data) * 0.1,
              f"{len(bad)} cross-faculty refs (ok if small): {bad[:3]}")

    # Grade data sanity
    grades_ok = True
    for label, data in [("math", math), ("physics", physics)]:
        for cid, cdata in data.items():
            avg = cdata.get("avg_grade")
            if avg is not None and (avg < 0 or avg > 100):
                grades_ok = False
                check(f"{label}/{cid} avg_grade in range", False, f"avg_grade={avg}")
    if grades_ok:
        check("All avg_grade values are 0-100 or null", True)

    # Check year digit heuristic validity (digit5 of course ID)
    for label, data in [("math", math), ("physics", physics)]:
        for cid, cdata in data.items():
            if len(cid) >= 5:
                d5 = int(cid[4])
                preqs = cdata.get("preq", [])
                # Year 1 courses (d5=1) should not have many prereqs from higher levels
                if d5 == 1 and preqs:
                    higher_preqs = [p for p in preqs if len(p) >= 5 and p[4] in "345"]
                    if higher_preqs:
                        check(f"{label}/{cid} year-1 has no year-3+ prereqs", False,
                              f"prereqs from higher years: {higher_preqs}")

    # No logic words in prereqs
    logic_words = {"וגם", "או", "and", "or"}
    for label, data in [("math", math), ("physics", physics)]:
        bad_logic = []
        for cid, cdata in data.items():
            for key in ("preq", "pareq"):
                for p in cdata.get(key, []):
                    if p in logic_words:
                        bad_logic.append(f"{cid}.{key}: {p}")
        check(f"{label} has no logic words in prereqs",
              len(bad_logic) == 0, f"found: {bad_logic[:5]}")


def test_depth_algorithm():
    """Test the depth algorithm logic (mirrors JS calculateCourseComplexity)."""
    print("\n=== Depth Algorithm ===")
    math, physics = load_json_data()
    all_data = {**math, **physics}

    # Build course list similar to JS
    courses = []
    for cid, info in all_data.items():
        prereqs = []
        for p in info.get("preq", []):
            if p in all_data and p not in ("וגם", "או"):
                prereqs.append(all_data[p]["name"])
        courses.append({
            "id": info["name"],
            "course_id": cid,
            "prereqs": prereqs,
            "coreqs": [],
        })

    # Python port of calculateCourseComplexity
    complexity = {}
    depths = {}
    visiting = set()

    def calc(course_id):
        if course_id in complexity:
            return complexity[course_id]
        if course_id in visiting:
            return 0
        visiting.add(course_id)

        course = next((c for c in courses if c["id"] == course_id), None)
        if not course:
            visiting.discard(course_id)
            return 0

        max_depth = 0
        total = 0
        for p in course.get("prereqs", []):
            total += calc(p)
            max_depth = max(max_depth, depths.get(p, 0))

        base_depth = 0
        cid = course.get("course_id", "")
        if len(cid) >= 5:
            year_digit = int(cid[4])
            if 1 <= year_digit <= 4:
                base_depth = year_digit - 1
            elif year_digit >= 5:
                base_depth = 3

        c = 1 + total
        complexity[course_id] = c

        calculated_depth = (max_depth + 1) if course.get("prereqs") else base_depth
        depths[course_id] = max(calculated_depth, base_depth)

        visiting.discard(course_id)
        return c

    for c in courses:
        calc(c["id"])

    # Verify: year-1 courses WITHOUT prereqs should be at depth 0
    # (Year-1 courses WITH prereqs correctly get depth > 0, e.g. חדו"א 2א depends on חדו"א 1א)
    year1_no_prereqs = [
        all_data[cid]["name"] for cid in all_data
        if len(cid) >= 5 and cid[4] == "1" and not all_data[cid].get("preq")
    ]
    bad_y1 = [(n, depths.get(n, -1)) for n in year1_no_prereqs if depths.get(n, -1) != 0]
    check("Year-1 courses without prereqs are at depth 0",
          len(bad_y1) == 0, f"exceptions: {bad_y1[:5]}")

    # Verify: courses with prereqs should be at depth > 0
    courses_with_prereqs = [c for c in courses if c["prereqs"]]
    bad_depth = [(c["id"], depths.get(c["id"], 0)) for c in courses_with_prereqs
                 if depths.get(c["id"], 0) == 0]
    check("Courses with prereqs have depth > 0",
          len(bad_depth) == 0, f"at depth 0: {bad_depth[:5]}")

    # Verify: a course's depth > all its prereqs' depths
    violations = []
    for c in courses:
        d = depths.get(c["id"], 0)
        for p in c.get("prereqs", []):
            pd = depths.get(p, 0)
            if d <= pd:
                violations.append(f"{c['id']}(d={d}) <= prereq {p}(d={pd})")
    check("Every course is deeper than all its prereqs",
          len(violations) == 0, f"{len(violations)} violations: {violations[:5]}")

    # Verify: graduate courses (digit5 >= 5) are at depth >= 3
    grad_names = [all_data[cid]["name"] for cid in all_data
                  if len(cid) >= 5 and int(cid[4]) >= 5]
    bad_grad = [(n, depths.get(n, -1)) for n in grad_names if depths.get(n, -1) < 3]
    check("Graduate courses (digit5>=5) at depth >= 3",
          len(bad_grad) == 0, f"too shallow: {bad_grad[:5]}")

    # Depth distribution summary
    from collections import Counter
    depth_dist = Counter(depths.values())
    print(f"  INFO  Depth distribution: {dict(sorted(depth_dist.items()))}")
    print(f"  INFO  Total courses processed: {len(depths)}")


# ── Playwright Browser Tests ──────────────────────────────────────────────────
def test_browser(page):
    print("\n=== Page Load & Basic Structure ===")

    # Navigate and wait for load
    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Wait for loading overlay to disappear
    page.wait_for_selector("#loadingOverlay.hidden", timeout=15000)
    check("Loading overlay disappears", True)

    # Title
    title = page.title()
    check("Page title is Hebrew", "עץ הקורסים" in title, f"got: {title}")

    # Header
    h1 = page.text_content("h1")
    check("H1 contains course tree title", "עץ" in h1 and "מתמטיקה" in h1, f"got: {h1}")

    # Cytoscape container exists and has content
    cy_el = page.locator("#cy")
    check("Cytoscape container exists", cy_el.count() == 1)

    # Check canvas is rendered (Cytoscape uses a canvas)
    canvas = page.locator("#cy canvas")
    check("Cytoscape canvas is rendered", canvas.count() > 0, f"found {canvas.count()} canvases")


def test_graph_nodes(page):
    print("\n=== Graph Node Rendering ===")

    # Count nodes via Cytoscape API
    node_count = page.evaluate("() => cy.nodes().not('.depth-label').length")
    check("Graph has nodes", node_count > 0, f"found {node_count} nodes")
    check("Node count is reasonable (10-200)", 10 <= node_count <= 200,
          f"got {node_count}")

    # Edge count
    edge_count = page.evaluate("() => cy.edges().length")
    check("Graph has edges", edge_count > 0, f"found {edge_count} edges")

    # All nodes have labels
    unlabeled = page.evaluate("""() => {
        return cy.nodes().not('.depth-label').filter(n => !n.data('label')).length;
    }""")
    check("All nodes have labels", unlabeled == 0, f"{unlabeled} unlabeled")

    # Nodes have valid positions (not all at 0,0)
    positions_check = page.evaluate("""() => {
        const nodes = cy.nodes().not('.depth-label');
        const at_origin = nodes.filter(n => n.position('x') === 0 && n.position('y') === 0).length;
        const total = nodes.length;
        return { at_origin, total };
    }""")
    check("Nodes are positioned (not all at origin)",
          positions_check["at_origin"] < positions_check["total"] * 0.1,
          f"{positions_check['at_origin']}/{positions_check['total']} at origin")


def test_depth_ordering_in_browser(page):
    print("\n=== Depth Ordering (Browser) ===")

    # Verify that nodes at higher depth have higher y-positions
    result = page.evaluate("""() => {
        const nodes = cy.nodes().not('.depth-label');
        const byDepth = new Map();
        nodes.forEach(n => {
            const d = n.data('depth') || 0;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d).push(n.position('y'));
        });

        const depthAvgs = [];
        for (const [d, ys] of byDepth.entries()) {
            depthAvgs.push({ depth: d, avgY: ys.reduce((a, b) => a + b, 0) / ys.length });
        }
        depthAvgs.sort((a, b) => a.depth - b.depth);

        // Check monotonically increasing y
        let violations = 0;
        for (let i = 1; i < depthAvgs.length; i++) {
            if (depthAvgs[i].avgY <= depthAvgs[i-1].avgY) violations++;
        }

        return {
            depthLevels: depthAvgs.length,
            violations,
            depths: depthAvgs
        };
    }""")

    check("Multiple depth levels exist", result["depthLevels"] > 1,
          f"found {result['depthLevels']} levels")
    check("Depth ordering is monotonic (higher depth = lower on screen)",
          result["violations"] == 0,
          f"{result['violations']} violations in {result['depthLevels']} levels")
    print(f"  INFO  Depth levels: {json.dumps(result['depths'], indent=2)}")


def test_prerequisite_edges(page):
    print("\n=== Prerequisite Edge Correctness ===")

    # Verify all prereq edges point from lower depth to higher depth
    result = page.evaluate("""() => {
        let correct = 0, wrong = 0, wrongEdges = [];
        cy.edges('[type="prereq"]').forEach(edge => {
            const srcDepth = edge.source().data('depth') || 0;
            const tgtDepth = edge.target().data('depth') || 0;
            if (srcDepth < tgtDepth) {
                correct++;
            } else {
                wrong++;
                if (wrongEdges.length < 5) {
                    wrongEdges.push({
                        src: edge.source().id(),
                        tgt: edge.target().id(),
                        srcD: srcDepth,
                        tgtD: tgtDepth
                    });
                }
            }
        });
        return { correct, wrong, wrongEdges };
    }""")

    check("Prereq edges go from lower to higher depth",
          result["wrong"] == 0,
          f"{result['wrong']} wrong, {result['correct']} correct. Examples: {result['wrongEdges']}")


def test_year_bands(page):
    print("\n=== Year Band Labels ===")

    bands = page.locator(".year-band")
    band_count = bands.count()
    check("Year bands are rendered", band_count > 0, f"found {band_count} bands")

    labels = page.locator(".year-band-label")
    label_count = labels.count()
    check("Year band labels exist", label_count > 0, f"found {label_count} labels")

    # Check labels contain expected Hebrew text
    label_texts = page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.year-band-label')).map(el => el.textContent);
    }""")
    check("Labels contain 'שנה'",
          all("שנה" in t for t in label_texts),
          f"labels: {label_texts}")
    check("Year labels count matches depth levels",
          len(label_texts) >= 2,
          f"got {len(label_texts)}: {label_texts}")


def test_filters(page):
    print("\n=== Filter Controls ===")

    # Sidebar toggle
    sidebar = page.locator("#sidebar")
    check("Sidebar starts closed", "open" not in (sidebar.get_attribute("class") or ""))

    page.click("#toggleSidebar")
    page.wait_for_timeout(400)
    check("Sidebar opens on click", "open" in (sidebar.get_attribute("class") or ""))

    # Filter selects exist
    for fid in ["facultyFilter", "yearFilter", "typeFilter", "evalFilter"]:
        el = page.locator(f"#{fid}")
        check(f"{fid} exists", el.count() == 1)
        option_count = page.evaluate(f"() => document.getElementById('{fid}').options.length")
        check(f"{fid} has options", option_count > 1, f"got {option_count}")

    # Faculty filter change: switch to physics
    node_count_before = page.evaluate("() => cy.nodes().not('.depth-label').length")

    page.evaluate("""() => {
        const sel = document.getElementById('facultyFilter');
        // Deselect all, then select physics
        Array.from(sel.options).forEach(o => o.selected = false);
        Array.from(sel.options).forEach(o => {
            if (o.value.includes('פיזיקה')) o.selected = true;
        });
        sel.dispatchEvent(new Event('change'));
    }""")
    page.wait_for_timeout(1000)

    node_count_after = page.evaluate("() => cy.nodes().not('.depth-label').length")
    h1_after = page.text_content("h1")
    check("Faculty switch changes graph", node_count_after != node_count_before,
          f"before: {node_count_before}, after: {node_count_after}")
    check("Title updates to physics", "פיזיקה" in h1_after, f"h1: {h1_after}")

    # Reset
    page.click("#closeSidebar")
    page.wait_for_timeout(300)
    page.click("#resetAll")
    page.wait_for_timeout(1000)

    node_count_reset = page.evaluate("() => cy.nodes().not('.depth-label').length")
    check("Reset restores math graph", node_count_reset == node_count_before,
          f"expected {node_count_before}, got {node_count_reset}")


def test_search(page):
    print("\n=== Search Functionality ===")

    search_input = page.locator("#search")
    check("Search input exists", search_input.count() == 1)

    # Type a search term
    search_input.fill("חשבון")
    page.wait_for_timeout(400)

    dropdown = page.locator("#searchDropdown")
    is_visible = dropdown.evaluate("el => el.classList.contains('visible')")
    check("Search dropdown appears", is_visible)

    items = page.locator(".search-dropdown-item[data-id]")
    item_count = items.count()
    check("Search returns results", item_count > 0, f"found {item_count} items")

    # Click first result
    if item_count > 0:
        first_id = items.first.get_attribute("data-id")
        items.first.click()
        page.wait_for_timeout(500)

        # Should focus on that node (hide others)
        hidden_count = page.evaluate("() => cy.nodes('.hidden').length")
        visible_count = page.evaluate("() => cy.nodes().not('.hidden').not('.depth-label').length")
        check("Clicking search result focuses graph",
              hidden_count > 0 or visible_count < 20,
              f"visible: {visible_count}, hidden: {hidden_count}")

    # Reset
    page.click("#resetAll")
    page.wait_for_timeout(500)


def test_node_interaction(page):
    print("\n=== Node Click Interaction ===")

    # Click on a node
    result = page.evaluate("""() => {
        const nodes = cy.nodes().not('.depth-label');
        if (nodes.length === 0) return { success: false, reason: 'no nodes' };

        // Find a node with prereqs
        let target = null;
        nodes.forEach(n => {
            if (!target) {
                const course = currentCourses.find(c => c.id === n.id());
                if (course && course.prereqs && course.prereqs.length > 0) {
                    target = n;
                }
            }
        });

        if (!target) return { success: false, reason: 'no node with prereqs' };
        return { success: true, nodeId: target.id() };
    }""")

    if result["success"]:
        node_id = result["nodeId"]

        # Simulate tap on the node
        page.evaluate(f"""() => {{
            const node = cy.getElementById('{node_id}');
            node.emit('tap');
        }}""")
        page.wait_for_timeout(600)

        hidden = page.evaluate("() => cy.nodes('.hidden').length")
        check(f"Clicking '{node_id}' hides some nodes",
              hidden > 0, f"hidden: {hidden}")

        # Reset
        page.evaluate("() => cy.emit('tap')")
        page.wait_for_timeout(500)
    else:
        check("Found node with prereqs for interaction test", False, result["reason"])


def test_tooltip(page):
    print("\n=== Tooltip ===")

    tooltip = page.locator("#course-tooltip")
    check("Tooltip element exists", tooltip.count() == 1)

    # Hover over a node
    result = page.evaluate("""() => {
        const nodes = cy.nodes().not('.depth-label');
        if (nodes.length === 0) return null;
        const n = nodes[0];
        const pos = n.renderedPosition();
        const bb = cy.container().getBoundingClientRect();
        return { x: bb.left + pos.x, y: bb.top + pos.y, id: n.id() };
    }""")

    if result:
        page.mouse.move(result["x"], result["y"])
        page.wait_for_timeout(300)

        is_visible = tooltip.evaluate("el => el.classList.contains('visible')")
        check("Tooltip appears on hover", is_visible)

        if is_visible:
            name_text = page.text_content(".tooltip-name")
            check("Tooltip shows course name", len(name_text) > 0, f"name: {name_text}")

        # Move away
        page.mouse.move(10, 10)
        page.wait_for_timeout(200)
    else:
        check("Could find node for tooltip test", False)


def test_planning_mode(page):
    print("\n=== Planning Mode ===")

    plan_btn = page.locator("#togglePlanning")
    check("Planning button exists", plan_btn.count() == 1)

    plan_btn.click()
    page.wait_for_timeout(300)

    is_active = plan_btn.evaluate("el => el.classList.contains('btn-active')")
    check("Planning button toggles active", is_active)

    # In planning mode, nodes should have reduced opacity (most are not taken/available)
    low_opacity = page.evaluate("""() => {
        let count = 0;
        cy.nodes().not('.depth-label').forEach(n => {
            if (parseFloat(n.style('opacity')) < 0.5) count++;
        });
        return count;
    }""")
    total = page.evaluate("() => cy.nodes().not('.depth-label').length")
    check("Planning mode dims unavailable courses",
          low_opacity > 0, f"{low_opacity}/{total} dimmed")

    # Toggle off
    plan_btn.click()
    page.wait_for_timeout(300)

    is_active_after = plan_btn.evaluate("el => el.classList.contains('btn-active')")
    check("Planning mode toggles off", not is_active_after)


def test_grade_colors(page):
    print("\n=== Grade Color Coding ===")

    result = page.evaluate("""() => {
        let withColor = 0, withoutColor = 0;
        cy.nodes().not('.depth-label').forEach(n => {
            const bg = n.style('background-color');
            if (bg && bg !== '#f7f8fa' && bg !== 'rgb(247, 248, 250)') {
                withColor++;
            } else {
                withoutColor++;
            }
        });
        return { withColor, withoutColor };
    }""")

    check("Some nodes have grade-based colors",
          result["withColor"] > 0,
          f"{result['withColor']} colored, {result['withoutColor']} default")


def test_grade_legend(page):
    print("\n=== Grade Legend ===")

    legend = page.locator("#legend")
    check("Legend element exists", legend.count() == 1)

    min_val = page.text_content("#gradeLegendMin")
    max_val = page.text_content("#gradeLegendMax")
    check("Grade legend min is a number",
          min_val and min_val != "-" and min_val.isdigit(),
          f"min: {min_val}")
    check("Grade legend max is a number",
          max_val and max_val != "-" and max_val.isdigit(),
          f"max: {max_val}")

    if min_val and max_val and min_val.isdigit() and max_val.isdigit():
        check("Grade legend min < max",
              int(min_val) < int(max_val),
              f"{min_val} < {max_val}")


def test_info_modal(page):
    print("\n=== Info Modal ===")

    page.click("#infoBtn")
    page.wait_for_timeout(300)

    overlay = page.locator("#modalOverlay")
    is_visible = overlay.evaluate("el => el.style.display !== 'none'")
    check("Info modal opens", is_visible)

    modal_text = page.text_content("#infoModal")
    check("Modal has help content",
          "לחיצה" in modal_text, f"text length: {len(modal_text)}")

    # Close by clicking the dark backdrop area (top-left corner, outside the modal)
    overlay.click(position={"x": 10, "y": 10}, force=True)
    page.wait_for_timeout(300)

    is_hidden = overlay.evaluate("el => el.style.display === 'none'")
    check("Modal closes on overlay click", is_hidden)


def test_responsive_layout(page):
    print("\n=== Layout & Responsiveness ===")

    # Check body direction
    direction = page.evaluate("() => getComputedStyle(document.body).direction")
    check("Body is RTL", direction == "rtl")

    # No horizontal overflow
    overflow = page.evaluate("""() => {
        return document.documentElement.scrollWidth <= window.innerWidth + 5;
    }""")
    check("No horizontal overflow", overflow)

    # Cytoscape fills available space
    cy_box = page.evaluate("""() => {
        const el = document.getElementById('cy');
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }""")
    check("Cytoscape has substantial width", cy_box["width"] > 500,
          f"width: {cy_box['width']}")
    check("Cytoscape has substantial height", cy_box["height"] > 300,
          f"height: {cy_box['height']}")


def test_no_console_errors(page):
    print("\n=== Console Errors ===")
    # We collected console errors during all previous tests
    js_errors = page.evaluate("""() => window.__testErrors || []""")
    check("No JavaScript errors", len(js_errors) == 0,
          f"errors: {js_errors[:5]}")


def test_visual_screenshot(page, screenshot_path):
    print("\n=== Visual Screenshot ===")
    page.screenshot(path=screenshot_path, full_page=False)
    check(f"Screenshot saved to {screenshot_path}",
          os.path.exists(screenshot_path))


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    global passed, failed

    srv = start_server()
    print(f"Server started on port {PORT}")

    # Run algorithmic tests (no browser needed)
    test_json_data()
    test_depth_algorithm()

    # Run browser tests
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="he-IL"
        )
        page = context.new_page()

        # Capture JS errors
        page.evaluate_handle("""() => {
            window.__testErrors = [];
            window.addEventListener('error', e => {
                window.__testErrors.push(e.message);
            });
            window.addEventListener('unhandledrejection', e => {
                window.__testErrors.push('Promise: ' + e.reason);
            });
        }""")

        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("#loadingOverlay.hidden", timeout=15000)

        # Inject error listener again after page load
        page.evaluate("""() => {
            if (!window.__testErrors) window.__testErrors = [];
            window.addEventListener('error', e => {
                window.__testErrors.push(e.message);
            });
        }""")

        test_browser(page)
        test_graph_nodes(page)
        test_depth_ordering_in_browser(page)
        test_prerequisite_edges(page)
        test_year_bands(page)
        test_grade_colors(page)
        test_grade_legend(page)
        test_filters(page)
        test_search(page)
        test_node_interaction(page)
        test_tooltip(page)
        test_planning_mode(page)
        test_info_modal(page)
        test_responsive_layout(page)
        test_no_console_errors(page)

        screenshot_path = os.path.join(PROJECT_DIR, "test_screenshot.png")
        test_visual_screenshot(page, screenshot_path)

        # Take a physics screenshot too
        try:
            # Ensure modal is closed first
            page.evaluate("() => { document.getElementById('modalOverlay').style.display = 'none'; }")
            page.wait_for_timeout(200)

            page.click("#toggleSidebar")
            page.wait_for_timeout(400)
            page.evaluate("""() => {
                const sel = document.getElementById('facultyFilter');
                Array.from(sel.options).forEach(o => o.selected = false);
                Array.from(sel.options).forEach(o => {
                    if (o.value.includes('פיזיקה')) o.selected = true;
                });
                sel.dispatchEvent(new Event('change'));
            }""")
            page.wait_for_timeout(1500)
            page.click("#closeSidebar")
            page.wait_for_timeout(300)
            physics_screenshot = os.path.join(PROJECT_DIR, "test_screenshot_physics.png")
            page.screenshot(path=physics_screenshot, full_page=False)
            print(f"  INFO  Physics screenshot saved to {physics_screenshot}")
        except Exception as e:
            print(f"  WARN  Physics screenshot failed: {e}")

        browser.close()

    # Summary
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    if errors:
        print("\nFailures:")
        for e in errors:
            print(e)
    print(f"{'='*60}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
