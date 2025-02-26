import sqlite3
import json
import os
from typing import Dict, List, Optional, Union
from datetime import datetime
import requests

class CourseDatabase:
    def __init__(self, db_path: str = "database/courses.db"):
        """Initialize the database connection."""
        self.db_path = db_path
        self._ensure_db_exists()

    def _ensure_db_exists(self):
        """Create the database and tables if they don't exist."""
        if not os.path.exists(os.path.dirname(self.db_path)):
            os.makedirs(os.path.dirname(self.db_path))
        
        with self.get_connection() as conn:
            with open('database/schema.sql', 'r') as f:
                conn.executescript(f.read())

    def get_connection(self) -> sqlite3.Connection:
        """Get a database connection that returns dictionaries for rows."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # This makes rows act like dictionaries
        return conn

    def get_courses_by_type(self, faculty_name: str, include_seminars: bool = True, 
                          include_guided_reading: bool = True, include_projects: bool = True,
                          include_isolated: bool = True) -> List[Dict]:
        """Get courses filtered by type and faculty, similar to course_graph.js filtering."""
        with self.get_connection() as conn:
            query = """
                SELECT 
                    c.course_code,
                    c.name,
                    d.name as department,
                    f.name as faculty,
                    GROUP_CONCAT(DISTINCT CASE WHEN p.is_parallel = 0 THEN pc.course_code END) as prereqs,
                    GROUP_CONCAT(DISTINCT CASE WHEN p.is_parallel = 1 THEN pc.course_code END) as coreqs,
                    EXISTS (
                        SELECT 1 FROM course_resources cr 
                        WHERE cr.course_id = c.id AND cr.resource_type = 'seminar'
                    ) as is_seminar,
                    EXISTS (
                        SELECT 1 FROM course_resources cr 
                        WHERE cr.course_id = c.id AND cr.resource_type = 'guided_reading'
                    ) as is_guided_reading,
                    EXISTS (
                        SELECT 1 FROM course_resources cr 
                        WHERE cr.course_id = c.id AND cr.resource_type = 'project'
                    ) as is_project
                FROM courses c
                LEFT JOIN departments d ON c.department_id = d.id
                LEFT JOIN faculties f ON d.faculty_id = f.id
                LEFT JOIN prerequisites p ON c.id = p.course_id
                LEFT JOIN courses pc ON p.prerequisite_course_id = pc.id
                WHERE f.name = ?
                GROUP BY c.id
                HAVING 1=1
            """
            
            conditions = []
            if not include_seminars:
                conditions.append("is_seminar = 0")
            if not include_guided_reading:
                conditions.append("is_guided_reading = 0")
            if not include_projects:
                conditions.append("is_project = 0")
            if not include_isolated:
                conditions.append("(prereqs IS NOT NULL OR coreqs IS NOT NULL)")
            
            if conditions:
                query += " AND " + " AND ".join(conditions)
            
            courses = conn.execute(query, (faculty_name,)).fetchall()
            
            return [{
                'course_code': course['course_code'],
                'name': course['name'],
                'faculty': course['faculty'],
                'department': course['department'],
                'prereqs': course['prereqs'].split(',') if course['prereqs'] else [],
                'coreqs': course['coreqs'].split(',') if course['coreqs'] else [],
                'is_seminar': bool(course['is_seminar']),
                'is_guided_reading': bool(course['is_guided_reading']),
                'is_project': bool(course['is_project'])
            } for course in courses]

    def get_prerequisites_tree(self, course_code: str) -> Dict:
        """Get the complete prerequisite tree for a course, similar to getAllPrerequisites in course_graph.js."""
        with self.get_connection() as conn:
            def get_prereqs_recursive(code: str, visited: set) -> set:
                if code in visited:
                    return set()
                
                visited.add(code)
                prereqs = conn.execute("""
                    SELECT pc.course_code, p.is_parallel
                    FROM courses c
                    JOIN prerequisites p ON c.id = p.course_id
                    JOIN courses pc ON p.prerequisite_course_id = pc.id
                    WHERE c.course_code = ?
                """, (code,)).fetchall()
                
                result = set()
                for prereq in prereqs:
                    result.add((prereq['course_code'], bool(prereq['is_parallel'])))
                    if not prereq['is_parallel']:  # Only recurse for non-parallel prerequisites
                        result.update(get_prereqs_recursive(prereq['course_code'], visited))
                
                return result

            prereqs = get_prereqs_recursive(course_code, set())
            return {
                'direct_prereqs': [p[0] for p in prereqs if not p[1]],
                'coreqs': [p[0] for p in prereqs if p[1]],
                'all_prereqs': list(set(p[0] for p in prereqs))
            }

    def search_courses(self, query: str, faculty: Optional[str] = None) -> List[Dict]:
        """Enhanced search function similar to the search in course_graph.js."""
        with self.get_connection() as conn:
            sql = """
                SELECT 
                    c.course_code,
                    c.name,
                    d.name as department,
                    f.name as faculty
                FROM courses c
                LEFT JOIN departments d ON c.department_id = d.id
                LEFT JOIN faculties f ON d.faculty_id = f.id
                WHERE (c.course_code LIKE ? OR c.name LIKE ?)
            """
            params = [f'%{query}%', f'%{query}%']
            
            if faculty:
                sql += " AND f.name = ?"
                params.append(faculty)
            
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def get_course_info(self, course_code: str) -> Optional[Dict]:
        """Get comprehensive information about a course including grades."""
        with self.get_connection() as conn:
            # Get basic course info
            course = conn.execute("""
                SELECT c.id, c.course_code, c.name,
                       f.name as faculty, d.name as department
                FROM courses c
                LEFT JOIN departments d ON c.department_id = d.id
                LEFT JOIN faculties f ON d.faculty_id = f.id
                WHERE c.course_code = ?
            """, (course_code,)).fetchone()
            
            if not course:
                return None
            
            course_info = dict(course)
            
            # Get offerings
            offerings = conn.execute("""
                SELECT year, semester
                FROM course_offerings
                WHERE course_id = ?
                ORDER BY year DESC, semester DESC
            """, (course['id'],)).fetchall()
            course_info['offerings'] = [dict(o) for o in offerings]
            
            # Get groups and lecturers - using "group_number" instead of "group"
            groups = conn.execute("""
                SELECT cg.group_number, l.name as lecturer
                FROM course_groups cg
                LEFT JOIN lecturers l ON cg.lecturer_id = l.id
                JOIN course_offerings co ON cg.course_offering_id = co.id
                WHERE co.course_id = ?
            """, (course['id'],)).fetchall()
            # Convert to the expected format with 'group' key
            course_info['groups'] = [{'group': g['group_number'], 'lecturer': g['lecturer']} for g in groups]
            
            # Get grades
            grades = self.get_course_grades(course_code)
            if grades:
                course_info['grades'] = grades
            
            return course_info

    def mark_course_type(self, course_code: str, course_type: str):
        """Mark a course as a specific type (seminar, guided_reading, project)."""
        with self.get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO course_resources (course_id, resource_type, url)
                VALUES (
                    (SELECT id FROM courses WHERE course_code = ?),
                    ?,
                    ''
                )
            """, (course_code, course_type))
            conn.commit()

    def import_json_courses(self, json_path: str):
        """Import courses from a JSON file into the database."""
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        with self.get_connection() as conn:
            # Process each course
            for course_code, course_data in data.items():
                # Extract faculty and department from the faculty field
                faculty_parts = course_data['faculty'].split('/')
                faculty_name = faculty_parts[0]
                department_name = faculty_parts[1] if len(faculty_parts) > 1 else None

                # Add faculty
                cursor = conn.execute(
                    "INSERT OR IGNORE INTO faculties (name) VALUES (?)",
                    (faculty_name,)
                )
                faculty_id = cursor.lastrowid or conn.execute(
                    "SELECT id FROM faculties WHERE name = ?",
                    (faculty_name,)
                ).fetchone()[0]

                # Add department if it exists
                department_id = None
                if department_name:
                    cursor = conn.execute(
                        "INSERT OR IGNORE INTO departments (faculty_id, name) VALUES (?, ?)",
                        (faculty_id, department_name)
                    )
                    department_id = cursor.lastrowid or conn.execute(
                        "SELECT id FROM departments WHERE faculty_id = ? AND name = ?",
                        (faculty_id, department_name)
                    ).fetchone()[0]

                # Add course
                cursor = conn.execute(
                    """INSERT OR IGNORE INTO courses 
                       (course_code, name, department_id) 
                       VALUES (?, ?, ?)""",
                    (course_code, course_data['name'], department_id)
                )
                course_id = cursor.lastrowid or conn.execute(
                    "SELECT id FROM courses WHERE course_code = ?",
                    (course_code,)
                ).fetchone()[0]

                # Add course offering
                if 'last_offered' in course_data:
                    year = course_data['last_offered'][:-1]  # Remove 'a' or 'b'
                    semester = course_data['last_offered'][-1]
                    conn.execute(
                        """INSERT OR IGNORE INTO course_offerings 
                           (course_id, year, semester) 
                           VALUES (?, ?, ?)""",
                        (course_id, year, semester)
                    )

                # Process groups and lecturers
                if 'groups' in course_data:
                    for group in course_data['groups']:
                        if group['lecturer']:
                            # Add lecturer
                            cursor = conn.execute(
                                "INSERT OR IGNORE INTO lecturers (name) VALUES (?)",
                                (group['lecturer'],)
                            )
                            lecturer_id = cursor.lastrowid or conn.execute(
                                "SELECT id FROM lecturers WHERE name = ?",
                                (group['lecturer'],)
                            ).fetchone()[0]

                            # Add course group
                            conn.execute(
                                """INSERT OR IGNORE INTO course_groups 
                                   (course_offering_id, group_number, lecturer_id) 
                                   VALUES (
                                       (SELECT id FROM course_offerings 
                                        WHERE course_id = ? AND year = ? AND semester = ?),
                                       ?, ?
                                   )""",
                                (course_id, year, semester, group['group'], lecturer_id)
                            )

                # Add course resources (exam links)
                if 'exam_links' in course_data:
                    for link in course_data['exam_links']:
                        conn.execute(
                            """INSERT OR IGNORE INTO course_resources 
                               (course_id, resource_type, url) 
                               VALUES (?, 'exam', ?)""",
                            (course_id, link)
                        )

    def get_prerequisites(self, course_code: str) -> List[Dict]:
        """Get prerequisites for a course."""
        with self.get_connection() as conn:
            return conn.execute("""
                SELECT c2.course_code, c2.name, p.is_parallel
                FROM prerequisites p
                JOIN courses c1 ON p.course_id = c1.id
                JOIN courses c2 ON p.prerequisite_course_id = c2.id
                WHERE c1.course_code = ?
            """, (course_code,)).fetchall()

    def add_prerequisite(self, course_code: str, prereq_code: str, is_parallel: bool = False):
        """Add a prerequisite relationship between courses."""
        with self.get_connection() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO prerequisites (course_id, prerequisite_course_id, is_parallel)
                VALUES (
                    (SELECT id FROM courses WHERE course_code = ?),
                    (SELECT id FROM courses WHERE course_code = ?),
                    ?
                )
            """, (course_code, prereq_code, is_parallel))
            conn.commit()

    def import_course_grades(self, cache_grades: bool = True):
        """Import course grades from arazim-project.com."""
        
        GRADES_URL = "https://arazim-project.com/data/grades.json"
        
        try:
            # Fetch grades data
            response = requests.get(GRADES_URL)
            response.raise_for_status()
            grades_data = response.json()
            
            with self.get_connection() as conn:
                # Create grades table if it doesn't exist
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS course_grades (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        course_id INTEGER,
                        year INTEGER NOT NULL,
                        semester TEXT NOT NULL,
                        group_number TEXT NOT NULL,
                        moed INTEGER NOT NULL,
                        average_grade REAL,
                        median_grade REAL,
                        standard_deviation REAL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (course_id) REFERENCES courses(id),
                        UNIQUE(course_id, year, semester, group_number, moed)
                    )
                """)
                
                for course_number, semester_data in grades_data.items():
                    # Get course_id if it exists in our database
                    course = conn.execute(
                        "SELECT id FROM courses WHERE course_code = ?",
                        (course_number,)
                    ).fetchone()
                    
                    if course:
                        course_id = course['id']
                        for semester, groups in semester_data.items():
                            year = semester[:-1]  # Remove 'a' or 'b' from semester
                            sem = semester[-1]    # Get 'a' or 'b'
                            
                            for group_number, grade_infos in groups.items():
                                for grade_info in grade_infos:
                                    if not isinstance(grade_info, dict):
                                        continue
                                        
                                    moed = grade_info.get('moed', 0)
                                    mean = grade_info.get('mean')
                                    median = grade_info.get('median')
                                    std_dev = grade_info.get('standard_deviation')
                                    
                                    if mean is not None:  # Only insert if we have grade data
                                        conn.execute("""
                                            INSERT OR REPLACE INTO course_grades 
                                            (course_id, year, semester, group_number, moed, 
                                             average_grade, median_grade, standard_deviation)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                        """, (course_id, year, sem, group_number, moed,
                                             mean, median, std_dev))
            
            conn.commit()
            
        except Exception as e:
            print(f"Error importing grades: {e}")

    def get_course_grades(self, course_code: str) -> List[Dict]:
        """Get grade history for a specific course."""
        with self.get_connection() as conn:
            grades = conn.execute("""
                SELECT cg.year, cg.semester, cg.group_number, cg.moed,
                       cg.average_grade, cg.median_grade, cg.standard_deviation
                FROM course_grades cg
                JOIN courses c ON c.id = cg.course_id
                WHERE c.course_code = ?
                ORDER BY cg.year DESC, cg.semester DESC, cg.group_number, cg.moed
            """, (course_code,)).fetchall()
            
            return [dict(g) for g in grades] 