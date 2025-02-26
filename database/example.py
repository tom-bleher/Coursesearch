from db import CourseDatabase
import os

def main():
    # Initialize the database
    db = CourseDatabase()

    # Import all JSON files from the courses directory
    courses_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'courses')
    for filename in os.listdir(courses_dir):
        if filename.endswith('.json'):
            print(f"Importing {filename}...")
            db.import_json_courses(os.path.join(courses_dir, filename))

    # Example: Search for a physics course
    print("\nSearching for 'physics' courses:")
    physics_courses = db.search_courses('physics')
    for course in physics_courses:
        print(f"{course['course_code']} - {course['name']} ({course['department']})")

    # Example: Get detailed information about a specific course
    course_code = "03211104"  # Introduction to Thermodynamics
    print(f"\nDetailed information for course {course_code}:")
    course_info = db.get_course_info(course_code)
    if course_info:
        print(f"Name: {course_info['name']}")
        print(f"Faculty: {course_info['faculty']}")
        print(f"Department: {course_info['department']}")
        print("\nOfferings:")
        for offering in course_info['offerings']:
            print(f"- Year {offering['year']}, Semester {offering['semester']}")
        print("\nGroups and Lecturers:")
        for group in course_info['groups']:
            print(f"- Group {group['group']}: {group['lecturer']}")
        if 'resources' in course_info and course_info['resources']:
            print("\nResources:")
            for resource in course_info['resources']:
                print(f"- {resource['type']}: {resource['url']}")

    # Import grades for recent semesters
    db.import_course_grades()
    
    # Example: Get grade history for a course
    course_code = "03211104"  # Example physics course
    print(f"\nGrade history for course {course_code}:")
    grades = db.get_course_grades(course_code)
    for grade in grades:
        print(f"Year {grade['year']} Semester {grade['semester']} "
              f"Group {grade['group_number']} Moed {grade['moed']}:")
        if grade['average_grade'] is not None:
            print(f"  Average: {grade['average_grade']:.1f}")
        if grade['median_grade'] is not None:
            print(f"  Median: {grade['median_grade']:.1f}")
        if grade['standard_deviation'] is not None:
            print(f"  Std Dev: {grade['standard_deviation']:.1f}")

if __name__ == "__main__":
    main() 