"""Checks for the data pipeline and the generated data/courses.json (no network)."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("update_data", ROOT / "scripts" / "update_data.py")
ud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ud)


@pytest.fixture(scope="module")
def data():
    return json.loads((ROOT / "data" / "courses.json").read_text(encoding="utf-8"))


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
def units(data):
    return [u for us in data["meta"]["faculties"].values() for u in us]


def test_meta(data):
    meta = data["meta"]
    assert meta["semesters"] == sorted(meta["semesters"], reverse=True)
    assert int(meta["semesters"][0][:4]) == meta["latest_year"]
    assert len(meta["grade_bins"]) == 10


def test_every_department_is_populated(data):
    for dept in units(data):
        current = [c for c in data["courses"].values()
                   if c.get("dept") == dept and c.get("last", "")[:4] == str(data["meta"]["latest_year"])]
        assert len(current) > 30, dept


def test_known_prerequisites(data):
    calc2 = data["courses"]["03661102"]
    assert calc2["req"] == "03661101"
    assert calc2["coreq"] == "03661112"


def test_requirements_resolve(data):
    courses, external = data["courses"], data["external"]
    leaves = [i for c in courses.values() for k in ("req", "coreq") for i in ud.req_ids(c.get(k))]
    unresolved = [i for i in leaves if i not in courses and i not in external]
    assert len(unresolved) / len(leaves) < 0.02, unresolved[:10]


def test_grade_stats_are_consistent(data):
    for cid, c in data["courses"].items():
        g = c.get("grades")
        if not g:
            continue
        assert g["n"] == sum(g["dist"]) == sum(n for _, _, n in g["by_sem"]), cid
        assert 0 <= g["mean"] <= 100, cid
        assert all(s[:4] >= str(data["meta"]["latest_year"] - ud.YEARS_BACK) for s, _, _ in g["by_sem"]), cid


def test_credits_are_numeric(data):
    assert all(isinstance(c["credits"], (int, float)) and c["credits"] > 0
               for c in data["courses"].values() if "credits" in c)
    current = [c for c in data["courses"].values() if c.get("dept") in units(data)
               and c.get("last", "")[:4] == str(data["meta"]["latest_year"])]
    assert sum("credits" in c for c in current) / len(current) > 0.65  # the rest are mostly seminars and theses


def test_plans(data):
    plans = data["plans"]
    assert len(plans) > 20
    for name, program in plans.items():
        assert program["categories"], name
        assert isinstance(program.get("faculty"), str) and program["faculty"], name
    assert plans["תוכנית חד-חוגית בפיזיקה"]["faculty"] == "מדעים מדויקים"
    # a few programs from other faculties (e.g. Law) define tracks rather than mandatory courses
    without_required = [n for n, p in plans.items() if not any(c["required"] for c in p["categories"])]
    assert len(without_required) <= len(plans) * 0.05, without_required


def test_official_catalog_programs(data):
    physics = data["plans"]["תוכנית חד-חוגית בפיזיקה"]
    assert physics["tcid"] and physics["url"].startswith("https://www.tau.ac.il/study-program")
    assert physics["total"] > 100
    electives = next(c for c in physics["categories"] if not c["required"])
    assert electives.get("credits") and electives.get("note")
    joint = data["plans"]["תוכנית דו-חוגית במתמטיקה ובמדעי המחשב"]
    assert {p["name"] for p in joint["parts"]} == {"תוכנית דו-חוגית במתמטיקה ובחוג נוסף", "תוכנית דו-חוגית במדעי המחשב ובחוג נוסף"}
