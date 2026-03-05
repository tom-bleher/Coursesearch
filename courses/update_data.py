"""
Fast data update script: fetches latest courses + grades from Arazim Project,
merges across years, and writes updated math.json / physics.json.

No TAU website scraping — generates links from templates and preserves
existing eval_type data from current JSON files.
"""

import json
import requests
import os
from statistics import mean

BASE_URL = "https://arazim-project.com/data"
GRADES_URL = f"{BASE_URL}/grades.json"
YEARS = ['2026', '2025', '2024', '2023', '2022', '2021']
SEMESTERS = ['b', 'a']
FACULTY = 'מדעים מדויקים'
DEPARTMENTS = {'מתמטיקה', 'פיזיקה'}

JSONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'JSONs')

GRADE_RANGES = ['0-49', '50-59', '60-64', '65-69', '70-74',
                '75-79', '80-84', '85-89', '90-94', '95-100']


def collect_courses(node):
    """Recursively collect course IDs from tau-tools prerequisites tree."""
    courses = []
    if not node or not isinstance(node, dict):
        return courses
    for item in node.get('courses', []):
        if isinstance(item, str):
            courses.append(item)
        elif isinstance(item, dict):
            courses.extend(collect_courses(item))
    return courses


def extract_prerequisites(prerequisites):
    """Extract flat prereq/coreq lists from structured tau-tools format."""
    preq = []
    pareq = []
    if prerequisites:
        preq = collect_courses(prerequisites)
        if 'parallel' in prerequisites:
            pareq = collect_courses(prerequisites['parallel'])
    return preq, pareq


def make_course_link(course_number, group_code, year):
    """Generate TAU syllabus link."""
    return (f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx"
            f"?course={course_number}{group_code}&year={int(year)-1}")


def make_req_url(course_number, year, semester):
    """Generate TAU prerequisites page link."""
    sem_num = '1' if semester == 'a' else '2'
    year_sem = f"{int(year)-1}{sem_num}"
    return (f"https://www.ims.tau.ac.il/Tal/kr/Drishot_L.aspx"
            f"?kurs={course_number}&sem={year_sem}")


def fetch_all_courses():
    """Download and merge courses from all year/semester combinations."""
    merged = {}  # course_id -> course_data (keeps latest offering)

    for year in YEARS:
        for sem in SEMESTERS:
            url = f"{BASE_URL}/courses-{year}{sem}.json"
            try:
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                print(f"  {year}{sem}: {len(data)} total courses")
            except requests.RequestException as e:
                print(f"  {year}{sem}: FAILED ({e})")
                continue

            for cid, cdata in data.items():
                faculty_str = cdata.get('faculty', '')
                parts = faculty_str.split('/')
                if len(parts) < 2:
                    continue
                main_faculty, dept = parts[0], parts[1]

                if main_faculty != FACULTY:
                    continue
                if dept not in DEPARTMENTS:
                    continue

                offered = f"{year}{sem}"

                # Only keep the latest offering of each course
                if cid in merged:
                    if offered <= merged[cid]['last_offered']:
                        continue

                # Extract prerequisites
                preq, pareq = [], []
                if 'prerequisites' in cdata:
                    preq, pareq = extract_prerequisites(cdata['prerequisites'])

                # Get first group code for link generation
                # Arazim groups can be a list of dicts or a dict of dicts
                raw_groups = cdata.get('groups', [])
                group_list = []
                first_group_code = '01'
                course_type = cdata.get('type', '')

                group_items = []
                if isinstance(raw_groups, list):
                    group_items = raw_groups
                elif isinstance(raw_groups, dict):
                    group_items = [{'group': k, **v} for k, v in raw_groups.items()]

                for gdata in group_items:
                    if not isinstance(gdata, dict):
                        continue
                    lessons = gdata.get('lessons', [])
                    # Check if ALL lessons are תרגיל
                    is_targil = (lessons and all(
                        l.get('type') == 'תרגיל'
                        for l in lessons if isinstance(l, dict)
                    ))
                    if is_targil:
                        continue

                    # Extract course type from first non-targil lesson
                    if not course_type:
                        for lesson in lessons:
                            if isinstance(lesson, dict):
                                lt = lesson.get('type', '')
                                if lt and lt != 'תרגיל':
                                    course_type = lt
                                    break

                    gid = gdata.get('group', '')
                    lecturer = (gdata.get('lecturer') or '').replace('\xa0', ' ')
                    group_list.append({
                        'group': gid,
                        'lecturer': lecturer
                    })
                    if first_group_code == '01' and gid:
                        first_group_code = gid

                # Extract eval_type from exams if available
                eval_type_set = []
                exams = cdata.get('exams', [])
                if isinstance(exams, list):
                    seen = set()
                    for exam in exams:
                        if isinstance(exam, dict):
                            et = exam.get('type', '')
                            if et and et not in seen:
                                seen.add(et)
                                eval_type_set.append(et)

                merged[cid] = {
                    'name': cdata.get('name', ''),
                    'faculty': faculty_str,
                    'type': course_type,
                    'groups': group_list if group_list else [],
                    'preq': preq,
                    'pareq': pareq,
                    'last_offered': offered,
                    'eval_type': eval_type_set,
                    'course_link': make_course_link(cid, first_group_code, year),
                    'req_url': make_req_url(cid, year, sem),
                }

    return merged


def fetch_grades():
    """Download grade data from Arazim."""
    print("\nFetching grades...")
    resp = requests.get(GRADES_URL, timeout=60)
    resp.raise_for_status()
    return resp.json()


def compute_grade_stats(course_grades):
    """Compute avg grade, distribution, and total students for a course."""
    all_means = []
    total_dist = [0] * 10  # 10 grade ranges

    for semester_data in course_grades.values():
        if not isinstance(semester_data, dict):
            continue
        for group_data in semester_data.values():
            if not isinstance(group_data, list):
                continue
            for entry in group_data:
                if not isinstance(entry, dict):
                    continue
                m = entry.get('mean')
                if m is not None and m != 0.0:
                    all_means.append(m)

                dist = entry.get('distribution', [])
                if isinstance(dist, list) and len(dist) >= 10:
                    for i in range(10):
                        total_dist[i] += dist[i]

    result = {}
    if all_means:
        result['avg_grade'] = round(sum(all_means) / len(all_means), 2)

    total_students = sum(total_dist)
    if total_students > 0:
        result['grade_distribution'] = {
            GRADE_RANGES[i]: total_dist[i] for i in range(10)
        }
        result['total_students'] = total_students

    return result


def remove_logic_words(courses):
    """Remove Hebrew logic words and תרגיל-style entries from prereqs."""
    logic_words = {'וגם', 'או', 'and', 'or'}
    for cdata in courses.values():
        for key in ('preq', 'pareq'):
            if key in cdata:
                cdata[key] = [
                    x for x in cdata[key]
                    if x not in logic_words
                ]


def load_existing_eval_types():
    """Load eval_type from existing JSON files to preserve them."""
    eval_types = {}
    for fname in ['math.json', 'physics.json']:
        path = os.path.join(JSONS_DIR, fname)
        if not os.path.exists(path):
            continue
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for cid, cdata in data.items():
            et = cdata.get('eval_type', [])
            if et:
                eval_types[cid] = et
    return eval_types


def main():
    print("=== Updating course data from Arazim Project ===\n")

    # Step 1: Load existing eval types before overwriting
    print("Loading existing eval_type data...")
    existing_eval_types = load_existing_eval_types()
    print(f"  Found eval_type for {len(existing_eval_types)} courses\n")

    # Step 2: Fetch all courses
    print("Fetching courses from Arazim...")
    courses = fetch_all_courses()
    print(f"\nTotal merged courses: {len(courses)}")

    # Step 3: Fetch grades and add stats
    all_grades = fetch_grades()
    grade_count = 0
    for cid in courses:
        if cid in all_grades:
            stats = compute_grade_stats(all_grades[cid])
            courses[cid].update(stats)
            if 'avg_grade' in stats:
                grade_count += 1
    print(f"Added grade data for {grade_count} courses")

    # Step 4: Fill in eval_type — keep Arazim exam data if present,
    # otherwise restore from existing files
    restored = 0
    for cid, cdata in courses.items():
        if not cdata.get('eval_type') and cid in existing_eval_types:
            cdata['eval_type'] = existing_eval_types[cid]
            restored += 1
    print(f"Restored eval_type for {restored} courses (from existing data)")

    # Step 5: Remove logic words from prereqs
    remove_logic_words(courses)

    # Step 6: Split by department and save
    os.makedirs(JSONS_DIR, exist_ok=True)

    dept_map = {
        'מתמטיקה': 'math.json',
        'פיזיקה': 'physics.json',
    }

    for dept, fname in dept_map.items():
        dept_courses = {
            cid: cdata for cid, cdata in courses.items()
            if cdata.get('faculty', '').endswith(f'/{dept}')
        }

        # Order keys consistently
        KEY_ORDER = [
            'name', 'faculty', 'type', 'groups', 'preq', 'pareq',
            'last_offered', 'eval_type', 'course_link', 'req_url',
            'avg_grade', 'grade_distribution', 'total_students'
        ]
        ordered = {}
        for cid, cdata in dept_courses.items():
            entry = {}
            for k in KEY_ORDER:
                if k in cdata:
                    entry[k] = cdata[k]
            # Any extra keys
            for k, v in cdata.items():
                if k not in entry:
                    entry[k] = v
            ordered[cid] = entry

        path = os.path.join(JSONS_DIR, fname)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(ordered, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {fname}: {len(ordered)} courses")

    print("\n=== Update complete! ===")


if __name__ == '__main__':
    main()
