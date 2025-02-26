-- Faculties table
CREATE TABLE IF NOT EXISTS faculties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_id INTEGER,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES faculties(id),
    UNIQUE(faculty_id, name)
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- Course offerings table (tracks when courses are offered)
CREATE TABLE IF NOT EXISTS course_offerings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    year INTEGER NOT NULL,
    semester TEXT NOT NULL, -- 'a' or 'b'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE(course_id, year, semester)
);

-- Lecturers table
CREATE TABLE IF NOT EXISTS lecturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Course groups table (for different groups/sections of the same course)
CREATE TABLE IF NOT EXISTS course_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_offering_id INTEGER,
    group_number TEXT NOT NULL,
    lecturer_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id),
    FOREIGN KEY (lecturer_id) REFERENCES lecturers(id),
    UNIQUE(course_offering_id, group_number)
);

-- Prerequisites table
CREATE TABLE IF NOT EXISTS prerequisites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    prerequisite_course_id INTEGER,
    is_parallel BOOLEAN DEFAULT FALSE, -- True for parallel requirements
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (prerequisite_course_id) REFERENCES courses(id),
    UNIQUE(course_id, prerequisite_course_id)
);

-- Course resources table (for links to exams, materials, etc.)
CREATE TABLE IF NOT EXISTS course_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    resource_type TEXT NOT NULL, -- 'exam', 'syllabus', etc.
    url TEXT NOT NULL,
    year INTEGER,
    semester TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- Course grades table
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
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(course_code);
CREATE INDEX IF NOT EXISTS idx_course_offerings_year_sem ON course_offerings(year, semester);
CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_course_groups_offering ON course_groups(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_course_grades ON course_grades(course_id, year, semester, group_number, moed);