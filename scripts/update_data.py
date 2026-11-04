"""
Build the site's data for all of Tel Aviv University from the Arazim Project's TAU data dumps.

Sources (format documented at https://github.com/arazimproject/tau-search/blob/main/src/types.ts):
  courses-{sem}.json  per-semester offerings, groups, exams, structured prerequisites
  courses.json        all-time course index (names, semesters offered)
  grades.json         grade distributions per semester / group / moed
  plans-{year}.json   study programs, incl. joint programs the official catalog lists only per major

and from TAU's official program catalog (ידיעון, https://www.tau.ac.il/search-studies-programs):
  program structure, credit requirements, official notes and per-course credit points

Output, split so the site loads only what it shows:
  data/index.json            every course's name, unit, prerequisites, semesters, credits and average
                             grade; the faculties and their units; the list of programs
  data/courses/{unit}.json   course details by the first four digits of the course number (the unit):
                             lecturers, exams, grade distribution, syllabus
  data/programs/{id}.json    one program: its structure, notes and earlier catalog editions

Run: python3 scripts/update_data.py   (stdlib only)
"""

import hashlib
import html
import http.client
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

BASE = "https://arazim-project.com/data"
DATA = Path(__file__).resolve().parent.parent / "data"

YEARS_BACK = 5  # offering window: latest academic year and the 5 before it (grades: their whole history)
OTHER = "אחר"  # faculty of courses and programs that don't name one
# Arazim's study plans add the joint programs the catalog lists only per major; its graduate and
# certificate plans duplicate the catalog's
PLAN_EXCLUDE = re.compile("תואר שני|תואר שלישי|לימודי תעודה|תעודת הוראה")
WORKERS = 3  # parallel requests to the catalog: polite, and enough
CATALOG_API = "https://tochniot.tau.ac.il/graphql"
CATALOG_PAGE = "https://www.tau.ac.il/study-program?safa={safa}&shana={shana}&tab=programStudy&tcid={tcid}"
SCHEDULE_PAGE = "https://www.tau.ac.il/study-program?safa={safa}&shana={shana}&tab=schedule&tcid={tcid}&menu={menu}"
PREVIOUS_CATALOGS = 2  # students follow the catalog of the year they started: keep the last two as well
MAX_LOST = 0.05  # share of programs (or catalog editions) that may disappear in one update
GRADE_BINS = ["0-49", "50-59", "60-64", "65-69", "70-74",
              "75-79", "80-84", "85-89", "90-94", "95-100"]
BIN_MIDPOINTS = [sum(map(int, b.split("-"))) / 2 for b in GRADE_BINS]
HEBREW_ORD = {"א": 1, "ב": 2, "ג": 3, "ד": 4}


def fetch(name):
    req = urllib.request.Request(f"{BASE}/{name}", headers={"User-Agent": "Coursesearch"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


# ── Prerequisites ────────────────────────────────────────────────────────────
def normalize_req(node):
    """Simplify an Arazim {kind, courses} tree into  "id" | {"all": [...]} | {"any": [...]} | None.

    Nested nodes of the same kind are merged, single-child nodes unwrapped, duplicates removed.
    """
    if isinstance(node, str):
        return node
    if not isinstance(node, dict) or not node.get("courses"):
        return None
    kind = node.get("kind") or "all"
    items = []
    for child in map(normalize_req, node["courses"]):
        if child is None:
            continue
        if isinstance(child, dict) and kind in child:
            children = child[kind]
        else:
            children = [child]
        items.extend(c for c in children if c not in items)
    if not items:
        return None
    return items[0] if len(items) == 1 else {kind: items}


def req_ids(req):
    if req is None:
        return []
    if isinstance(req, str):
        return [req]
    return [i for child in next(iter(req.values())) for i in req_ids(child)]


# ── Courses ──────────────────────────────────────────────────────────────────
def course_type(groups):
    """Dominant non-exercise lesson type (e.g. שיעור, סמינר, מעבדה)."""
    types = Counter(l.get("type") for g in groups for l in g.get("lessons") or []
                    if l.get("type") and l.get("type") != "תרגיל")
    return types.most_common(1)[0][0] if types else ("תרגיל" if groups else None)


def lecture_groups(groups):
    """Groups that teach something other than exercise sessions."""
    return [g for g in groups
            if any(l.get("type") != "תרגיל" for l in g.get("lessons") or [])] or groups


def build_offering(cid, info, sem):
    groups = info.get("groups") or []
    lectures = lecture_groups(groups)
    prereq = info.get("prerequisites") or {}
    lecturers = []
    for g in lectures:
        for name in (g.get("lecturer") or "").replace("\xa0", " ").split(","):
            if name.strip() and name.strip() not in lecturers:
                lecturers.append(name.strip())
    return {
        "name": info.get("name", "").strip(),
        "dept": (info.get("faculty") or "").split("/")[-1],
        "type": course_type(groups),
        "lecturers": lecturers,
        "exams": sorted({e["type"] for e in info.get("exams") or [] if e.get("type")}),
        "req": normalize_req(prereq),
        "coreq": normalize_req(prereq.get("parallel")),
        "group": lectures[0].get("group") if lectures else None,
        "sem": sem,
    }


# ── Grades ───────────────────────────────────────────────────────────────────
def semester_grades(groups):
    """Final-grade ("מועד קובע", moed 0) distribution for one semester.

    Group "00" is Arazim's all-groups aggregate; without it, sum the individual groups.
    Bin 11 (200-210, non-numeric grades) is dropped.
    """
    def final(entries):
        return next((e for e in entries or [] if e.get("moed") == 0 and e.get("distribution")), None)

    entries = [final(groups["00"])] if "00" in groups else [final(v) for v in groups.values()]
    dist, total = [0] * len(GRADE_BINS), 0.0
    for e in filter(None, entries):
        d = (e["distribution"] + [0] * len(GRADE_BINS))[:len(GRADE_BINS)]
        n = sum(d)
        if n:
            # TAU Factor gives a mean of 0 (or none) for many semesters, mostly 2014-2016:
            # estimate it from the bin midpoints (within a point on average where both are given)
            total += (e.get("mean") or sum(c * m for c, m in zip(d, BIN_MIDPOINTS)) / n) * n
            dist = [a + b for a, b in zip(dist, d)]
    n = sum(dist)
    return {"mean": round(total / n, 1), "n": n, "dist": dist} if n else None


def grade_stats(course_grades, first_year, last_year):
    by_sem = []
    total = [0] * len(GRADE_BINS)
    weighted = 0.0
    for sem in sorted(course_grades or {}):
        if not re.fullmatch(r"\d{4}[ab]", sem) or not first_year <= int(sem[:4]) <= last_year:
            continue  # skip summer terms and malformed future keys
        s = semester_grades(course_grades[sem] or {})
        if not s:
            continue
        by_sem.append([sem, s["mean"], s["n"]])
        total = [a + b for a, b in zip(total, s["dist"])]
        weighted += s["mean"] * s["n"]
    n = sum(total)
    if not n:
        return None
    return {"mean": round(weighted / n, 1), "n": n, "dist": total, "by_sem": by_sem}


# ── Study programs ───────────────────────────────────────────────────────────
def parse_category(name):
    """Extract (year, semester, required) from names like "שנה ב' - סמסטר א' - קורסי חובה"."""
    y = re.search(r"שנה\s+([אבגד])", name) or re.search(r"שנים\s+([אבגד])", name)
    s = re.search(r"סמס(?:טר)?'?\s*([אב])", name)
    required = bool(re.search("חובה|mandatory", name, re.I)) and not re.search("בחירה|elective", name, re.I)
    return (HEBREW_ORD[y.group(1)] if y else None,
            HEBREW_ORD[s.group(1)] if s else None,
            required)


def norm_name(name):
    return re.sub(r"[\s\-–]+", "", name or "")


def short_faculty(name):
    """'הפקולטה למדעי החברה ע"ש גרשון גורדון' → 'מדעי החברה'; 'בית הספר סגול למדעי המוח' → 'מדעי המוח'."""
    name = re.sub(r'\s+ע["״]ש\s.*$', "", name.strip())
    return re.sub(r"^(?:הפקולטה|בית הספר(?: סגול)?)\s+ל", "", name)


def arazim_programs(plans):
    """{program: {"faculty": ..., "categories": [...]}} from Arazim's plans-{year}.json (every faculty)."""
    out = {}
    for faculty, programs in (plans or {}).items():
        for name, cats in programs.items():
            if PLAN_EXCLUDE.search(name):
                continue
            categories = []
            for cat, info in cats.items():
                if "שאר רוח" in cat or not (info or {}).get("courses"):
                    continue
                categories.append(make_category(cat, info["courses"], info.get("count")))
            if categories:
                out[re.sub(r"\s+", " ", name).strip()] = {"faculty": short_faculty(faculty), "level": "ראשון",
                                                            "categories": categories}
    return out


def plan_credits(plans_by_year):
    """Credit points of every course in any faculty's study plan, newest year first.

    The semester data has no credit points, so this covers courses outside the catalog programs.
    """
    credits = {}
    for plans in plans_by_year:
        for programs in (plans or {}).values():
            for cats in programs.values():
                for info in cats.values():
                    for cid, c in ((info or {}).get("courses") or {}).items():
                        weight = number((c or {}).get("weight"))  # Arazim stores it as a string
                        if weight:
                            credits.setdefault(cid[:8], weight)
    return credits


def course_numbers(ids):
    """Some programs (e.g. law) list each group: course number + 2-digit group."""
    return list(dict.fromkeys(c[:8] for c in ids))


def make_category(name, courses, count=None, credits=None, note=None):
    listed = len(courses)  # Arazim may count each listed group of a course
    courses = course_numbers(courses)
    name = re.sub(r"\s+", " ", name).strip()
    year, sem, required = parse_category(name)
    # Mandatory even when not labelled "חובה": every listed course is required, or the official
    # note opens by calling them mandatory ("להלן רשימת קורסי החובה…")
    required = required or (not re.search("בחירה|elective", name, re.I) and (count in (listed, len(courses))
                                                    or bool(re.search(r"קורסי\s+ה?חובה", (note or "")[:60]))))
    cat = {"name": name, "year": year, "sem": sem, "required": required, "count": count,
           "credits": credits, "note": note, "courses": courses}
    return {k: v for k, v in cat.items() if v not in (None, "")}


def number(text):
    try:
        v = float(text)
    except (TypeError, ValueError):
        return None
    return int(v) if v.is_integer() else v


def credit_range(text):
    """'סה"כ 59-61 ש"ס' → '59-61'."""
    m = re.search(r"\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?", text or "")
    return re.sub(r"\s", "", m.group(0)) if m else None


def html_text(fragment):
    text = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</div>|</h\d>", "\n", fragment or "")
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\s*\n\s*", "\n", text).strip()


# ── Official catalog ─────────────────────────────────────────────────────────
class NoData(Exception):
    """The catalog's answer that it has nothing for a request, e.g. a program without a published structure."""


def catalog(query, variables, tries=4):
    """A catalog API request; network errors are retried, then raised so a partial fetch never goes out."""
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(CATALOG_API, body, {"content-type": "application/json", "User-Agent": "Coursesearch"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.load(r)
            break
        except (OSError, http.client.HTTPException) as e:  # incl. HTTP errors and timeouts
            code = getattr(e, "code", None)
            if isinstance(code, int) and 400 <= code < 500 and code != 429:  # a definite answer, not a passing failure
                raise NoData(f"HTTP {code}") from e
            if attempt == tries - 1:
                raise
            print(f"  catalog request failed ({e}); retrying", flush=True)
            time.sleep(15 * 2 ** attempt)
    if out.get("errors"):
        raise NoData(out["errors"][0].get("message"))
    return out["data"]


def catalog_page(api, shana, tcid, safa="1"):
    """One page of a program; safa is the language: "1" Hebrew, "2" English (international programs)."""
    q = "query($api: String!, $f: JSON!) { results(apiUrl: $api, filters: $f) { body } }"
    body = catalog(q, {"api": api, "f": {"safa": safa, "shana": str(shana), "tcid": tcid, "tab": "programStudy"}})
    return (body["results"]["body"] or [None])[0]


def catalog_programs(shana):
    """Every program of the year's catalog: all faculties and degrees."""
    q = ("query($s: JSON!) { getPrograms(search: $s, from: 0, size: 5000) "
         "{ results { tcid shana toar teur teurfaculta teurchug } } }")
    results = catalog(q, {"s": {"safa": "1", "isLoadPrograms": True}})["getPrograms"]["results"]
    return [p for p in results if p["shana"] == str(shana) and p["tcid"] and p["teur"]]


def catalog_program(shana, tcid, counts, faculty=None, safa="1"):
    """One official program: structure, notes, links; `counts` maps category names to Arazim's "choose k"."""
    page = catalog_page("ydtochnit", shana, tcid, safa)
    if not page:
        raise NoData(f"no page for {tcid} in {shana}")
    general = catalog_page("ydhesberklali", shana, tcid, safa) or {}
    categories, sections, credits = [], [], {}

    def walk(node, path):
        title = re.sub(r"\s+", " ", node.get("teurrama") or "").strip()
        name = " - ".join(path + [title])
        courses = [k for k in node.get("kurs") or [] if k.get("mevutal") != "1"]
        for k in courses:
            if number(k.get("shaotuni")):
                credits[k["kursid"][:8]] = number(k["shaotuni"])
        if courses and "שאר רוח" not in name:
            categories.append(make_category(name, [k["kursid"] for k in courses],
                                            counts.get(norm_name(name)), credit_range(node.get("shaot")),
                                            html_text(node.get("hesber"))))
        for child in node.get("rama") or []:
            walk(child, path + [title])

    for menu, top in enumerate(page.get("rama") or [], 1):
        sections.append({k: v for k, v in {
            "name": top.get("teurrama", "").strip(), "credits": credit_range(top.get("shaot")),
            "note": html_text(top.get("hesber")),
            "schedule": SCHEDULE_PAGE.format(safa=safa, shana=shana, tcid=tcid, menu=menu)}.items() if v})
        walk(top, [])

    links = [{"title": t["Title"].strip(), "url": t["url"]} for t in page.get("terms") or [] if t.get("url")]
    links += [{"title": f"ידיעון {p['shana']}", "url": p["url"]} for p in (page.get("prev_newsletters") or [])[:1]]
    program = {
        "tcid": tcid,
        "url": CATALOG_PAGE.format(safa=safa, shana=shana, tcid=tcid),
        "faculty": faculty,
        "degree": (page.get("teurtoar") or "").strip(),
        "total": number(general.get("michsa")),
        "about": html_text(page.get("hesbernosaf")),
        "sections": sections,
        "links": links,
        "categories": categories,
    }
    return {k: v for k, v in program.items() if v not in (None, "", [])}, credits


def fetch_program(p, shana, counts):
    """One catalog program and its earlier editions; None when the catalog has no structure for it."""
    name = re.sub(r"\s+", " ", p["teur"]).strip()
    safa = "1" if re.search("[א-ת]", name) else "2"  # international programs exist only in English
    try:
        program, credits = catalog_program(shana, p["tcid"], counts.get(norm_name(name), {}),
                                           short_faculty(p["teurfaculta"] or "") or OTHER, safa)
    except NoData:  # programs without a published structure (PhD, MD, …)
        return name, None, {}
    if not program.get("categories"):
        return name, None, {}
    program["level"] = p["toar"] or OTHER
    # Earlier catalogs of the same program, for students who started in those years
    previous = {}
    for year in range(shana - 1, shana - 1 - PREVIOUS_CATALOGS, -1):
        try:
            old, _ = catalog_program(year, p["tcid"], {}, safa=safa)
        except NoData:  # not in that year's catalog
            continue
        if old.get("categories"):
            previous[str(year)] = {k: old[k] for k in ("url", "total", "sections", "categories") if k in old}
    if previous:
        program["previous"] = previous
    return name, program, credits


def build_plans(arazim_plans, shana):
    """Bachelor's programs: the official catalog's, plus Arazim's joint programs (linked to their official halves).
    Credits come from every catalog program, graduate ones included."""
    arazim, credits = arazim_programs(arazim_plans), {}
    counts = {norm_name(n): {norm_name(c["name"]): c.get("count") for c in p["categories"]} for n, p in arazim.items()}
    try:
        official = catalog_programs(shana)
    except (OSError, http.client.HTTPException) as e:
        print(f"  catalog unavailable ({e}); keeping the published programs", flush=True)
        return published_plans()
    print(f"  {len(official)} catalog programs", flush=True)
    catalog_plans, by_name = {}, {}
    pool = ThreadPoolExecutor(WORKERS)
    try:
        for i, (p, (name, program, program_credits)) in enumerate(
                zip(official, pool.map(lambda p: fetch_program(p, shana, counts), official)), 1):
            if program:
                catalog_plans[name] = program
                credits.update(program_credits)
                by_name[name] = p
            if i % 50 == 0:
                print(f"  {i}/{len(official)}", flush=True)
    finally:
        pool.shutdown(cancel_futures=True)  # after a failure, don't wait for the remaining programs
    # Arazim adds what the catalog lacks: mostly joint programs (the same name spelled differently is a duplicate)
    known = {norm_name(n) for n in catalog_plans}
    plans = {**{n: p for n, p in arazim.items() if norm_name(n) not in known}, **catalog_plans}
    # Joint programs (e.g. "דו-חוגית במתמטיקה ובמדעי המחשב") are two "…ובחוג נוסף" catalog programs
    halves = [(p["teurchug"], name) for name, p in by_name.items() if "חוג נוסף" in name and p.get("teurchug")]
    for name, program in plans.items():
        if "tcid" not in program:
            # match on the major's leading name ("מדעי כדור הארץ וכוכבי הלכת" → "מדעי כדור הארץ")
            program["parts"] = [{"name": half, "url": plans[half]["url"]} for chug, half in halves
                                if re.search(rf"ו?ב{re.escape(chug.split(' ו')[0])}(\s|$)", name)]
    return dict(sorted((n, p) for n, p in plans.items() if p.get("level") == "ראשון")), credits


def published_plans():
    """The programs and credits already published: what an update keeps while the catalog is down."""
    index = read_data("index.json") or {}
    plans = {name: read_data(f"programs/{p['id']}.json") for name, p in index.get("programs", {}).items()}
    for program in plans.values():
        for edition in [program, *program.get("previous", {}).values()]:
            for cat in edition["categories"]:
                cat["courses"] = course_numbers(cat["courses"])
    credits = {cid: c["credits"] for cid, c in index.get("courses", {}).items() if c.get("credits")}
    return plans, credits


# ── Output ───────────────────────────────────────────────────────────────────
INDEX_FIELDS = ("name", "dept", "type", "req", "coreq", "semesters", "last", "credits")
DETAIL_FIELDS = ("lecturers", "exams", "grades", "syllabus")


def program_id(name, program):
    """File name of a program: its catalog id, or a stable hash of its name (Arazim's joint programs)."""
    return program.get("tcid") or "a" + hashlib.sha1(name.encode()).hexdigest()[:10]


def split(courses, plans):
    """{relative path: content}: the index, course details by unit code, one file per program."""
    index_courses, details = {}, {}
    for cid, c in courses.items():
        entry = {k: c[k] for k in INDEX_FIELDS if k in c}
        if "grades" in c:
            entry["mean"] = c["grades"]["mean"]
        index_courses[cid] = entry
        # every unit gets a file, even an empty one, so the site never asks for a missing file
        unit = details.setdefault(f"courses/{cid[:4]}.json", {})
        detail = {k: c[k] for k in DETAIL_FIELDS if k in c}
        if detail:
            unit[cid] = detail
    programs, files = {}, {}
    for name, program in plans.items():
        pid = program_id(name, program)
        programs[name] = {"id": pid, "faculty": program.get("faculty") or OTHER, "level": program.get("level") or OTHER}
        files[f"programs/{pid}.json"] = program
    return index_courses, programs, {**details, **files}


def write_json(path, content):
    """Write if different; True when the file changed."""
    text = json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def read_data(rel):
    path = DATA / rel
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def check_programs_kept(programs, files):
    """Stop before publishing data that lost many programs or catalog editions: a sign of a failed fetch."""
    old = (read_data("index.json") or {}).get("programs")
    if not old:
        return

    def editions(programs, read):
        return sum(1 + len((read(f"programs/{p['id']}.json") or {}).get("previous", {})) for p in programs.values())

    lost = sorted(old.keys() - programs.keys())
    before, after = editions(old, read_data), editions(programs, files.get)
    if len(lost) > MAX_LOST * len(old) or after < (1 - MAX_LOST) * before:
        sys.exit(f"Not writing: {len(lost)} of {len(old)} programs gone ({', '.join(lost[:5])}), "
                 f"catalog editions {before} → {after}. If expected, delete data/index.json and rerun.")


def write_site_data(index, files):
    """Write the data files, removing ones no longer produced. The index's date changes only with the data."""
    changed = False
    for folder in ("courses", "programs"):
        for old in (DATA / folder).glob("*.json"):
            if f"{folder}/{old.name}" not in files:
                old.unlink()
                changed = True
    for rel, content in files.items():
        changed |= write_json(DATA / rel, content)
    old = DATA / "index.json"
    if not changed and old.exists():
        previous = json.loads(old.read_text(encoding="utf-8"))
        if {**index, "meta": {**index["meta"], "generated": previous["meta"]["generated"]}} == previous:
            return False
    return write_json(old, index) or changed


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    info = fetch("info.json") or {}
    years = sorted({int(s[:4]) for s in info.get("semesters", {})}, reverse=True)

    print("Fetching semesters…", flush=True)
    offerings = {}  # sem -> {cid: info}
    for year in range(years[0], years[0] - YEARS_BACK - 1, -1):
        for part in "ba":
            data = fetch(f"courses-{year}{part}.json")
            if data:
                offerings[f"{year}{part}"] = data
                print(f"  {year}{part}: {len(data)} courses", flush=True)
    if not offerings:
        sys.exit("No semester data found")
    semesters = sorted(offerings, reverse=True)
    latest_year = int(semesters[0][:4])

    print("Fetching study programs, all-time index, grades…", flush=True)
    plans_by_year = [fetch(f"plans-{y}.json") for y in range(latest_year, latest_year - YEARS_BACK - 1, -1)]
    plans, credits = build_plans(plans_by_year[0], latest_year - 1)
    credits = {**plan_credits(plans_by_year), **credits}  # the official catalog takes precedence
    all_time = fetch("courses.json") or {}
    grades = fetch("grades.json") or {}
    plan_ids = {c for p in plans.values()
                for edition in [p, *p.get("previous", {}).values()] for cat in edition["categories"] for c in cat["courses"]}

    # Every course offered in the window, described by its latest offering
    courses, unit_courses = {}, {}
    for sem in semesters:  # newest first
        for cid, cinfo in offerings[sem].items():
            if cid in courses:
                courses[cid]["semesters"].append(sem)
                continue
            courses[cid] = build_offering(cid, cinfo, sem)
            courses[cid]["semesters"] = [sem]
            faculty = (cinfo.get("faculty") or "").split("/")[0] or OTHER
            unit_courses.setdefault(faculty, Counter())[courses[cid]["dept"]] += 1

    # Program courses not offered in the window: name and unit from the all-time index
    for cid in plan_ids - courses.keys():
        a = all_time.get(cid)
        if a:
            courses[cid] = {"name": a.get("name", "").strip(), "dept": (a.get("faculty") or "").split("/")[-1],
                            "semesters": []}

    # Names for other courses referenced by prerequisites (shown in details, not as nodes)
    referenced = {i for c in courses.values() for k in ("req", "coreq") for i in req_ids(c.get(k))}
    external = {cid: all_time[cid]["name"].strip() for cid in sorted(referenced - courses.keys())
                if all_time.get(cid, {}).get("name")}

    for cid, c in courses.items():
        last_ever = next(iter(all_time.get(cid, {}).get("semesters") or []), None)
        c["last"] = c["semesters"][0] if c["semesters"] else last_ever
        c["credits"] = credits.get(cid)
        # grade data has thinned out in recent years, so a course's whole history is used
        g = grade_stats(grades.get(cid), 0, latest_year)
        if g:
            c["grades"] = g
        sem, group = c.pop("sem", None), c.pop("group", None)
        if sem and group:
            c["syllabus"] = (f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx"
                             f"?course={cid}{group}&year={int(sem[:4]) - 1}")
        for k in [k for k, v in c.items() if v in (None, [], "")]:
            del c[k]

    index_courses, programs, files = split(dict(sorted(courses.items())), plans)
    index = {
        "meta": {
            "generated": date.today().isoformat(),
            "latest_year": latest_year,
            "semesters": semesters,
            "grade_bins": GRADE_BINS,
            # faculties, largest first, and their units, largest first
            "faculties": {f: [u for u, _ in units.most_common() if u]
                          for f, units in sorted(unit_courses.items(), key=lambda x: -sum(x[1].values()))},
            "catalog_year": latest_year - 1,
        },
        "courses": index_courses,
        "external": external,
        "programs": programs,
    }
    check_programs_kept(programs, files)
    if not write_site_data(index, files):
        print("No changes.")
        return
    print(f"\nWrote data/: {len(courses)} courses ({sum('grades' in c for c in courses.values())} with grades) "
          f"in {len(unit_courses)} faculties, {len(plans)} programs, {len(external)} external refs")


if __name__ == "__main__":
    main()
