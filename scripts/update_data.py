"""
Build data/courses.json from the Arazim Project's TAU data dumps.

Sources (format documented at https://github.com/arazimproject/tau-search/blob/main/src/types.ts):
  courses-{sem}.json  per-semester offerings, groups, exams, structured prerequisites
  courses.json        all-time course index (names, semesters offered)
  grades.json         grade distributions per semester / group / moed
  plans-{year}.json   study programs, incl. joint programs the official catalog lists only per major

and from TAU's official program catalog (ידיעון, https://www.tau.ac.il/search-studies-programs):
  program structure, credit requirements, official notes and per-course credit points

Run: python3 scripts/update_data.py   (stdlib only)
"""

import html
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

BASE = "https://arazim-project.com/data"
OUT = Path(__file__).resolve().parent.parent / "data" / "courses.json"

YEARS_BACK = 5  # offering / grade window: latest academic year and the 5 before it
DEPARTMENTS = ["מתמטיקה", "פיזיקה", "מדעי המחשב"]
FACULTY = "מדעים מדויקים"
PLAN_FACULTY = "הפקולטה למדעים מדויקים"
PLAN_PATTERN = re.compile("|".join(DEPARTMENTS))
PLAN_EXCLUDE = re.compile("תואר שני|לימודי תעודה")
# Official catalog programs to include: every undergraduate program of these faculties, plus any
# program elsewhere whose name matches PLAN_PATTERN. Use {""} to include the whole university.
CATALOG_FACULTIES = {"הפקולטה למדעים מדויקים"}
CATALOG_API = "https://tochniot.tau.ac.il/graphql"
CATALOG_PAGE = "https://www.tau.ac.il/study-program?safa=1&shana={shana}&tab=programStudy&tcid={tcid}"
SCHEDULE_PAGE = "https://www.tau.ac.il/study-program?safa=1&shana={shana}&tab=schedule&tcid={tcid}&menu={menu}"
PREVIOUS_CATALOGS = 2  # students follow the catalog of the year they started: keep the last two as well
GRADE_BINS = ["0-49", "50-59", "60-64", "65-69", "70-74",
              "75-79", "80-84", "85-89", "90-94", "95-100"]
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
    entries = [e for e in entries if e and e.get("mean") is not None]
    if not entries:
        return None
    dist = [sum(e["distribution"][i] if i < len(e["distribution"]) else 0 for e in entries)
            for i in range(len(GRADE_BINS))]
    n = sum(dist)
    if n == 0:
        return None
    mean = sum(e["mean"] * sum(e["distribution"][:len(GRADE_BINS)]) for e in entries) / n
    return {"mean": round(mean, 1), "n": n, "dist": dist}


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
    required = "חובה" in name and "בחירה" not in name
    return (HEBREW_ORD[y.group(1)] if y else None,
            HEBREW_ORD[s.group(1)] if s else None,
            required)


def norm_name(name):
    return re.sub(r"[\s\-–]+", "", name or "")


def arazim_programs(plans):
    """{program: {"categories": [...]}} from Arazim's plans-{year}.json."""
    out = {}
    for name, cats in (plans or {}).get(PLAN_FACULTY, {}).items():
        if not PLAN_PATTERN.search(name) or PLAN_EXCLUDE.search(name):
            continue
        categories = []
        for cat, info in cats.items():
            if "שאר רוח" in cat or not info.get("courses"):
                continue
            categories.append(make_category(cat, info["courses"], info.get("count")))
        if categories:
            out[re.sub(r"\s+", " ", name).strip()] = {"categories": categories}
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
                            credits.setdefault(cid, weight)
    return credits


def make_category(name, courses, count=None, credits=None, note=None):
    name = re.sub(r"\s+", " ", name).strip()
    year, sem, required = parse_category(name)
    # Mandatory even when not labelled "חובה": every listed course is required, or the official
    # note opens by calling them mandatory ("להלן רשימת קורסי החובה…")
    required = required or ("בחירה" not in name and (count == len(courses)
                                                    or bool(re.search(r"קורסי\s+ה?חובה", (note or "")[:60]))))
    cat = {"name": name, "year": year, "sem": sem, "required": required, "count": count,
           "credits": credits, "note": note, "courses": list(courses)}
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
def catalog(query, variables):
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(CATALOG_API, body, {"content-type": "application/json", "User-Agent": "Coursesearch"})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.load(r)
    if out.get("errors"):
        raise RuntimeError(out["errors"][0].get("message"))
    return out["data"]


def catalog_page(api, shana, tcid):
    q = "query($api: String!, $f: JSON!) { results(apiUrl: $api, filters: $f) { body } }"
    body = catalog(q, {"api": api, "f": {"safa": "1", "shana": str(shana), "tcid": tcid, "tab": "programStudy"}})
    return (body["results"]["body"] or [None])[0]


def catalog_programs(shana):
    q = ("query($s: JSON!) { getPrograms(search: $s, from: 0, size: 5000) "
         "{ results { tcid shana toar teur teurfaculta teurchug } } }")
    results = catalog(q, {"s": {"safa": "1", "isLoadPrograms": True}})["getPrograms"]["results"]
    return [p for p in results if p["shana"] == str(shana) and p["toar"] == "ראשון" and p["tcid"] and p["teur"]
            and (p["teurfaculta"] in CATALOG_FACULTIES or "" in CATALOG_FACULTIES or PLAN_PATTERN.search(p["teur"]))
            and not PLAN_EXCLUDE.search(p["teur"])]


def catalog_program(shana, tcid, counts):
    """One official program: structure, notes, links; `counts` maps category names to Arazim's "choose k"."""
    page = catalog_page("ydtochnit", shana, tcid)
    general = catalog_page("ydhesberklali", shana, tcid) or {}
    categories, sections, credits = [], [], {}

    def walk(node, path):
        title = re.sub(r"\s+", " ", node.get("teurrama") or "").strip()
        name = " - ".join(path + [title])
        courses = [k for k in node.get("kurs") or [] if k.get("mevutal") != "1"]
        for k in courses:
            if number(k.get("shaotuni")):
                credits[k["kursid"]] = number(k["shaotuni"])
        if courses and "שאר רוח" not in name:
            categories.append(make_category(name, dict.fromkeys(k["kursid"] for k in courses),
                                            counts.get(norm_name(name)), credit_range(node.get("shaot")),
                                            html_text(node.get("hesber"))))
        for child in node.get("rama") or []:
            walk(child, path + [title])

    for menu, top in enumerate(page.get("rama") or [], 1):
        sections.append({k: v for k, v in {
            "name": top.get("teurrama", "").strip(), "credits": credit_range(top.get("shaot")),
            "note": html_text(top.get("hesber")),
            "schedule": SCHEDULE_PAGE.format(shana=shana, tcid=tcid, menu=menu)}.items() if v})
        walk(top, [])

    links = [{"title": t["Title"].strip(), "url": t["url"]} for t in page.get("terms") or [] if t.get("url")]
    links += [{"title": f"ידיעון {p['shana']}", "url": p["url"]} for p in (page.get("prev_newsletters") or [])[:1]]
    program = {
        "tcid": tcid,
        "url": CATALOG_PAGE.format(shana=shana, tcid=tcid),
        "degree": (page.get("teurtoar") or "").strip(),
        "total": number(general.get("michsa")),
        "about": html_text(page.get("hesbernosaf")),
        "sections": sections,
        "links": links,
        "categories": categories,
    }
    return {k: v for k, v in program.items() if v not in (None, "", [])}, credits


def build_plans(arazim_plans, shana):
    """Official catalog programs, plus Arazim's joint programs (linked to their official halves)."""
    plans, credits = arazim_programs(arazim_plans), {}
    counts = {norm_name(n): {norm_name(c["name"]): c.get("count") for c in p["categories"]} for n, p in plans.items()}
    try:
        official = catalog_programs(shana)
    except Exception as e:  # keep the Arazim data if the catalog is unavailable
        print(f"  catalog unavailable ({e}); using Arazim plans only")
        return plans, credits
    print(f"  {len(official)} catalog programs")
    by_name = {}
    for p in official:
        name = re.sub(r"\s+", " ", p["teur"]).strip()
        try:
            program, program_credits = catalog_program(shana, p["tcid"], counts.get(norm_name(name), {}))
        except Exception as e:
            print(f"  skipped {name}: {e}")
            continue
        if not program.get("categories"):
            continue
        # Earlier catalogs of the same program, for students who started in those years
        previous = {}
        for year in range(shana - 1, shana - 1 - PREVIOUS_CATALOGS, -1):
            try:
                old, _ = catalog_program(year, p["tcid"], {})
            except Exception:
                continue
            if old.get("categories"):
                previous[str(year)] = {k: old[k] for k in ("url", "total", "sections", "categories") if k in old}
        if previous:
            program["previous"] = previous
        plans[name] = program
        credits.update(program_credits)
        by_name[name] = p
    # Joint programs (e.g. "דו-חוגית במתמטיקה ובמדעי המחשב") are two "…ובחוג נוסף" catalog programs
    halves = [(p["teurchug"], name) for name, p in by_name.items() if "חוג נוסף" in name and p.get("teurchug")]
    for name, program in plans.items():
        if "tcid" not in program:
            # match on the major's leading name ("מדעי כדור הארץ וכוכבי הלכת" → "מדעי כדור הארץ")
            program["parts"] = [{"name": half, "url": plans[half]["url"]} for chug, half in halves
                                if chug.split(" ו")[0] in name]
    return dict(sorted(plans.items())), credits


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    info = fetch("info.json") or {}
    years = sorted({int(s[:4]) for s in info.get("semesters", {})}, reverse=True)

    print("Fetching semesters…")
    offerings = {}  # sem -> {cid: info}
    for year in years:
        if offerings and year < int(max(offerings)[:4]) - YEARS_BACK:
            break
        for part in "ba":
            data = fetch(f"courses-{year}{part}.json")
            if data:
                offerings[f"{year}{part}"] = data
                print(f"  {year}{part}: {len(data)} courses")
    if not offerings:
        sys.exit("No semester data found")
    semesters = sorted(offerings, reverse=True)
    latest_year = int(semesters[0][:4])
    first_year = latest_year - YEARS_BACK

    print("Fetching study programs, all-time index, grades…")
    plans_by_year = [fetch(f"plans-{y}.json") for y in range(latest_year, first_year - 1, -1)]
    plans, credits = build_plans(plans_by_year[0], latest_year - 1)
    credits = {**plan_credits(plans_by_year), **credits}  # the official catalog takes precedence
    all_time = fetch("courses.json") or {}
    grades = fetch("grades.json") or {}

    dept_faculties = {f"{FACULTY}/{d}" for d in DEPARTMENTS}
    plan_ids = {c for p in plans.values()
                for edition in [p, *p.get("previous", {}).values()] for cat in edition["categories"] for c in cat["courses"]}

    # Latest offering of every in-scope course within the window
    courses = {}
    for sem in semesters:  # newest first
        for cid, cinfo in offerings[sem].items():
            if cid in courses:
                courses[cid]["semesters"].append(sem)
            elif cinfo.get("faculty") in dept_faculties or cid in plan_ids:
                courses[cid] = build_offering(cid, cinfo, sem)
                courses[cid]["semesters"] = [sem]

    # Plan courses not offered in the window: name / faculty from the all-time index
    for cid in plan_ids - courses.keys():
        a = all_time.get(cid)
        if a:
            courses[cid] = {"name": a.get("name", "").strip(), "dept": (a.get("faculty") or "").split("/")[-1],
                            "semesters": []}

    # Names for out-of-scope courses referenced by prerequisites (shown in details, not as nodes)
    referenced = {i for c in courses.values() for k in ("req", "coreq") for i in req_ids(c.get(k))}
    external = {cid: all_time[cid]["name"].strip() for cid in sorted(referenced - courses.keys())
                if all_time.get(cid, {}).get("name")}

    for cid, c in courses.items():
        last_ever = next(iter(all_time.get(cid, {}).get("semesters") or []), None)
        c["last"] = c["semesters"][0] if c["semesters"] else last_ever
        c["credits"] = credits.get(cid)
        g = grade_stats(grades.get(cid), first_year, latest_year)
        if g:
            c["grades"] = g
        sem, group = c.pop("sem", None), c.pop("group", None)
        if sem and group:
            c["syllabus"] = (f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx"
                             f"?course={cid}{group}&year={int(sem[:4]) - 1}")
        for k in [k for k, v in c.items() if v in (None, [], "")]:
            del c[k]

    out = {
        "meta": {
            "generated": date.today().isoformat(),
            "latest_year": latest_year,
            "semesters": semesters,
            "grade_bins": GRADE_BINS,
            "departments": DEPARTMENTS,
            "catalog_year": latest_year - 1,
        },
        "courses": dict(sorted(courses.items())),
        "external": external,
        "plans": plans,
    }
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        old["meta"]["generated"] = out["meta"]["generated"]
        if old == out:
            print("No changes.")
            return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    depts = Counter(c.get("dept") for c in courses.values())
    print(f"\nWrote {OUT.relative_to(OUT.parent.parent)}: {len(courses)} courses, "
          f"{sum(1 for c in courses.values() if 'grades' in c)} with grades, "
          f"{len(plans)} programs, {len(external)} external refs")
    print("  " + ", ".join(f"{d}: {n}" for d, n in depts.most_common(6)))


if __name__ == "__main__":
    main()
