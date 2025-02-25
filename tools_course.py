import json


class InfoCourses:
    """Class to get information about courses"""
    
    def __init__(self, json_file_path: str):
        self.json_file_path = json_file_path


    # ------------------------------ Informative ------------------------------

    def get_course_types(self, json_file_path: str) -> set[str]:
        """
        Get all unique lesson types from the course data.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            
        Returns:
            Set of unique lesson types
        """
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        lesson_types = set()
        for course_data in courses.values():
            if 'groups' in course_data:
                for group in course_data['groups']:
                    if 'lessons' in group:
                        for lesson in group['lessons']:
                            if 'type' in lesson:
                                lesson_types.add(lesson['type'])
        
        return lesson_types


    # ------------------------------ Filters ------------------------------


    def filter_exact_sciences_courses(input_file: str = 'exact_sciences_2021-2025.json', 
                                    output_file: str = 'filtered_exact_sciences_2021-2025.json'):
        """
        Filter courses to keep only Physics, Mathematics and Computer Science courses
        from the Exact Sciences faculty.
        
        Args:
            input_file: Path to input JSON file
            output_file: Path to output JSON file
        """
        # Faculties to keep
        target_faculties = {
            "מדעים מדויקים/פיזיקה",
            "מדעים מדויקים/מתמטיקה",
            "מדעים מדויקים/מדעי המחשב"
        }
        
        # Read the original file
        with open(input_file, 'r', encoding='utf-8') as f:
            courses = json.load(f)
        
        # Filter courses
        filtered_courses = {
            code: data 
            for code, data in courses.items()
            if data.get('faculty') in target_faculties
        }
        
        # Save filtered data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(filtered_courses, f, ensure_ascii=False, indent=2)
        
        # Print summary
        print(f"\nOriginal number of courses: {len(courses)}")
        print(f"Number of courses after filtering: {len(filtered_courses)}")
        
        # Print count by faculty
        faculty_counts = {}
        for course in filtered_courses.values():
            faculty = course.get('faculty', 'Unknown')
            faculty_counts[faculty] = faculty_counts.get(faculty, 0) + 1
        
        print("\nCourses by faculty:")
        for faculty, count in faculty_counts.items():
            print(f"- {faculty}: {count} courses")