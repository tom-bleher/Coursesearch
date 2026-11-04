"""Checks for the data pipeline and the generated data/ files (no network)."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("update_data", ROOT / "scripts" / "update_data.py")
ud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ud)


def read(rel):
    return json.loads((ROOT / "data" / rel).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def index():
    return read("index.json")


def program(index, name):
    return read(f"programs/{index['programs'][name]['id']}.json")


# ── Pipeline units ───────────────────────────────────────────────────────────
def test_normalize_req_merges_and_unwraps():
    tree = {"kind": "all", "courses": [{"kind": "all", "courses": ["A", "B"]},
                                       {"kind": "any", "courses": ["C"]}, "A"]}
    assert ud.normalize_req(tree) == {"all": ["A", "B", "C"]}
    assert ud.normalize_req({"kind": "any", "courses": ["A", {"kind": "all", "courses": ["B", "C"]}]}) == \
        {"any": ["A", {"all": ["B", "C"]}]}
    assert ud.normalize_req({"parallel": {"kind": "all", "courses": ["X"]}}) is None
    assert ud.normalize_req(None) is None


def test_semester_grades_prefers_aggregate_final_grade():
    dist = [1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 5]  # trailing 200-210 bin is dropped
    groups = {
        "00": [{"moed": 1, "distribution": [9] * 10, "mean": 50}, {"moed": 0, "distribution": dist, "mean": 80}],
        "01": [{"moed": 0, "distribution": [7] * 10, "mean": 70}],
    }
    assert ud.semester_grades(groups) == {"mean": 80.0, "n": 4, "dist": [1, 0, 0, 0, 0, 0, 0, 0, 0, 3]}


def test_semester_grades_sums_groups_without_aggregate():
    groups = {"01": [{"moed": 0, "distribution": [2] + [0] * 9, "mean": 40}],
              "02": [{"moed": 0, "distribution": [0] * 9 + [2], "mean": 100}]}
    assert ud.semester_grades(groups) == {"mean": 70.0, "n": 4, "dist": [2] + [0] * 8 + [2]}


def test_semester_grades_estimates_missing_mean():
    # TAU Factor reports a mean of 0 for many semesters that have a distribution
    groups = {"00": [{"moed": 0, "distribution": [0] * 6 + [2, 0, 2, 0], "mean": 0.0}]}
    assert ud.semester_grades(groups)["mean"] == 87.0  # midpoints 82 and 92


def test_plan_credits_prefers_newest_year():
    newest = {"F": {"P": {"cat": {"courses": {"A": {"weight": "4.0"}, "B": None}}}}}
    older = {"G": {"Q": {"cat": {"courses": {"A": {"weight": "3"}, "C": {"weight": "2.5"}}}, "empty": None}}}
    assert ud.plan_credits([newest, None, older]) == {"A": 4, "C": 2.5}


def test_check_programs_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(ud, "DATA", tmp_path)
    old = {f"P{i}": {"id": str(i)} for i in range(20)}
    files = {f"programs/{i}.json": {"previous": {"2024": {}, "2023": {}}} for i in range(20)}
    (tmp_path / "programs").mkdir()
    (tmp_path / "index.json").write_text(json.dumps({"programs": old}))
    for rel, content in files.items():
        (tmp_path / rel).write_text(json.dumps(content))
    ud.check_programs_kept(old, files)  # unchanged
    ud.check_programs_kept(dict(list(old.items())[1:]), files)  # one program gone
    with pytest.raises(SystemExit):  # many programs gone
        ud.check_programs_kept(dict(list(old.items())[5:]), files)
    with pytest.raises(SystemExit):  # earlier catalog editions gone
        ud.check_programs_kept(old, {rel: {} for rel in files})


def test_catalog_down_keeps_published_programs(tmp_path, monkeypatch):
    monkeypatch.setattr(ud, "DATA", tmp_path)
    (tmp_path / "programs").mkdir()
    (tmp_path / "index.json").write_text(json.dumps({
        "programs": {"P": {"id": "1"}}, "courses": {"14119101": {"credits": 4}, "14119102": {}}}))
    (tmp_path / "programs/1.json").write_text(json.dumps({"level": "ראשון", "categories": [
        {"courses": ["1411910101", "1411910102", "14119102"]}], "previous": {"2025": {"categories": []}}}))

    def down(shana):
        raise OSError("HTTP 503")
    monkeypatch.setattr(ud, "catalog_programs", down)
    plans, credits = ud.build_plans({}, 2026)
    assert plans["P"]["categories"][0]["courses"] == ["14119101", "14119102"]
    assert credits == {"14119101": 4}


def test_required_category_counts_listed_groups():
    # all 3 listed groups of 2 courses are required, or the single course of a "choose 1"
    assert ud.make_category("שנה א", ["1000000001", "1000000002", "2000000001"], 3)["required"]
    assert ud.make_category("שנה א", ["1000000001", "1000000002"], 1)["required"]
    assert not ud.make_category("שנה א", ["10000000", "20000000", "30000000"], 2)["required"]


@pytest.mark.parametrize("name, expected", [
    ("Mandatory Courses", (None, None, True)),
    ("Elective Courses/ Seminars", (None, None, False)),
    ("שנה א' - סמסטר ב' - קורסי חובה", (1, 2, True)),
    ("שנים ב'+ ג' - קורסי בחירה במתמטיקה", (2, None, False)),
    ("שנה ג' - סמינר במתמטיקה", (3, None, False)),
    ("סל חובת בחירה א' - סל חובת בחירה א'", (None, None, False)),
    ("שנים ב' + ג' - שנה ג' - סמינר מחקרי חובה בסמסטר א'", (3, 1, True)),
])
def test_parse_category(name, expected):
    assert ud.parse_category(name) == expected


@pytest.mark.parametrize("name, expected", [
    ("הפקולטה למדעים מדויקים", "מדעים מדויקים"),
    ('הפקולטה למדעי החברה ע"ש גרשון גורדון', "מדעי החברה"),
    ("בית הספר סגול למדעי המוח", "מדעי המוח"),
    ("בית הספר לסביבה", "סביבה"),
    ('בית הספר לעבודה סוציאלית ע"ש בוב שאפל', "עבודה סוציאלית"),
    ('הפקולטה להנדסה ע"ש איבי ואלדר פליישמן', "הנדסה"),
    ('הפקולטה למשפטים ע"ש בוכמן', "משפטים"),
])
def test_short_faculty(name, expected):
    assert ud.short_faculty(name) == expected


# ── Generated data ───────────────────────────────────────────────────────────
def current(index, dept):
    return [c for c in index["courses"].values()
            if c.get("dept") == dept and c.get("last", "")[:4] == str(index["meta"]["latest_year"])]


def test_meta(index):
    meta = index["meta"]
    assert meta["semesters"] == sorted(meta["semesters"], reverse=True)
    assert int(meta["semesters"][0][:4]) == meta["latest_year"]
    assert len(meta["grade_bins"]) == 10


def test_whole_university(index):
    faculties = index["meta"]["faculties"]
    assert len(faculties) >= 10 and sum(map(len, faculties.values())) >= 100
    assert {"מתמטיקה", "פיזיקה", "מדעי המחשב"} <= set(faculties["מדעים מדויקים"])
    for dept in ("מתמטיקה", "פיזיקה", "מדעי המחשב", "כלכלה", "פילוסופיה"):
        assert len(current(index, dept)) > 30, dept
    assert len(index["courses"]) > 10000


def test_split_files_exist(index):
    assert {f"{cid[:4]}.json" for cid in index["courses"]} == {f.name for f in (ROOT / "data" / "courses").glob("*.json")}
    assert {f"{p['id']}.json" for p in index["programs"].values()} == \
        {f.name for f in (ROOT / "data" / "programs").glob("*.json")}


def test_known_prerequisites(index):
    calc2 = index["courses"]["03661102"]
    assert calc2["req"] == "03661101"
    assert calc2["coreq"] == "03661112"


def test_requirements_resolve(index):
    courses, external = index["courses"], index["external"]
    leaves = [i for c in courses.values() for k in ("req", "coreq") for i in ud.req_ids(c.get(k))]
    unresolved = [i for i in leaves if i not in courses and i not in external]
    assert len(unresolved) / len(leaves) < 0.02, unresolved[:10]


def test_grade_stats_are_consistent(index):
    with_grades = 0
    for unit in (ROOT / "data" / "courses").glob("*.json"):
        for cid, d in read(f"courses/{unit.name}").items():
            g = d.get("grades")
            if not g:
                continue
            with_grades += 1
            assert g["n"] == sum(g["dist"]) == sum(n for _, _, n in g["by_sem"]), cid
            assert 0 <= g["mean"] <= 100 and index["courses"][cid]["mean"] == g["mean"], cid
    assert with_grades > 2000


def test_grade_means_are_not_missing(index):
    # TAU Factor gives a mean of 0 for semesters it has no mean for; a course average of 0 means it leaked
    assert not [cid for cid, c in index["courses"].items() if c.get("mean") == 0]
    assert 85 < index["courses"]["06621137"]["mean"] < 95  # mostly 80-100, but 0 reported for 2014-2015


def test_credits_are_numeric(index):
    assert all(isinstance(c["credits"], (int, float)) and c["credits"] > 0
               for c in index["courses"].values() if "credits" in c)
    courses = [c for d in ("מתמטיקה", "פיזיקה", "מדעי המחשב") for c in current(index, d)]
    assert sum("credits" in c for c in courses) / len(courses) > 0.65  # the rest are mostly seminars and theses


def test_programs(index):
    programs = index["programs"]
    assert {p["level"] for p in programs.values()} == {"ראשון"}  # bachelor's only
    assert programs["תוכנית חד-חוגית בפיזיקה"]["faculty"] == "מדעים מדויקים"
    assert len(programs) > 150
    for name in programs:
        assert program(index, name)["categories"], name


def test_program_courses_resolve(index):
    ids = [cid for name in index["programs"] for p in [program(index, name)]
           for edition in [p, *p.get("previous", {}).values()] for cat in edition["categories"] for cid in cat["courses"]]
    assert all(len(cid) == 8 and cid.isdigit() for cid in ids), {cid for cid in ids if len(cid) != 8}
    assert sum(cid in index["courses"] for cid in ids) / len(ids) > 0.97
    law = program(index, "תוכנית חד-חוגית במשפטים")  # its catalog lists courses with their group number
    required = [cid for cat in law["categories"] if cat["required"] for cid in cat["courses"]]
    assert required and all(index["courses"].get(cid, {}).get("credits") for cid in required)


def test_official_catalog_programs(index):
    physics = program(index, "תוכנית חד-חוגית בפיזיקה")
    assert physics["tcid"] and physics["url"].startswith("https://www.tau.ac.il/study-program")
    assert physics["total"] > 100
    electives = next(c for c in physics["categories"] if not c["required"])
    assert electives.get("credits") and electives.get("note")
    joint = program(index, "תוכנית דו-חוגית במתמטיקה ובמדעי המחשב")
    assert {p["name"] for p in joint["parts"]} == {"תוכנית דו-חוגית במתמטיקה ובחוג נוסף", "תוכנית דו-חוגית במדעי המחשב ובחוג נוסף"}
