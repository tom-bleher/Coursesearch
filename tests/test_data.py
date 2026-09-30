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


def test_plan_credits_prefers_newest_year():
    newest = {"F": {"P": {"cat": {"courses": {"A": {"weight": "4.0"}, "B": None}}}}}
    older = {"G": {"Q": {"cat": {"courses": {"A": {"weight": "3"}, "C": {"weight": "2.5"}}}, "empty": None}}}
    assert ud.plan_credits([newest, None, older]) == {"A": 4, "C": 2.5}


@pytest.mark.parametrize("name, expected", [
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


def test_credits_are_numeric(index):
    assert all(isinstance(c["credits"], (int, float)) and c["credits"] > 0
               for c in index["courses"].values() if "credits" in c)
    courses = [c for d in ("מתמטיקה", "פיזיקה", "מדעי המחשב") for c in current(index, d)]
    assert sum("credits" in c for c in courses) / len(courses) > 0.65  # the rest are mostly seminars and theses


def test_programs(index):
    programs = index["programs"]
    assert len(programs) > 300
    assert {p["level"] for p in programs.values()} >= {"ראשון", "שני"}
    assert programs["תוכנית חד-חוגית בפיזיקה"]["faculty"] == "מדעים מדויקים"
    bachelors = [n for n, p in programs.items() if p["level"] == "ראשון"]
    assert len(bachelors) > 150
    for name in bachelors:
        assert program(index, name)["categories"], name


def test_official_catalog_programs(index):
    physics = program(index, "תוכנית חד-חוגית בפיזיקה")
    assert physics["tcid"] and physics["url"].startswith("https://www.tau.ac.il/study-program")
    assert physics["total"] > 100
    electives = next(c for c in physics["categories"] if not c["required"])
    assert electives.get("credits") and electives.get("note")
    joint = program(index, "תוכנית דו-חוגית במתמטיקה ובמדעי המחשב")
    assert {p["name"] for p in joint["parts"]} == {"תוכנית דו-חוגית במתמטיקה ובחוג נוסף", "תוכנית דו-חוגית במדעי המחשב ובחוג נוסף"}
