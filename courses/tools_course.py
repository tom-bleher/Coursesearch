import json
import re
from typing import Dict

class ToolsCourse:
    """Class to get information about courses"""
    
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

    
    # ------------------------------ Repairs ------------------------------

    def validate_course_type(self, json_file_path: str) -> Dict[str, Dict]:
        """
        Validate and fix course types based on course title keywords.
        Checks both Hebrew and English keywords in the title and updates the course type if needed.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            
        Returns:
            Dictionary with course numbers as keys and their changes as values
        """
        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        # Define keywords for each type in both Hebrew and English
        type_keywords = {
            'סמינר': ['סמינר', 'סמינריון', 'seminar', 'seminary', 'proseminar'],
            'מעבדה': ['מעבדה', 'מעבדת', 'laboratory', 'lab', 'labs'],
            'קריאה מודרכת': ['קריאה', 'guided reading', 'reading', 'supervised reading'],
            'סדנה': ['סדנה', 'סדנת', 'workshop', 'studio'],
            'פרויקט': ['פרויקט', 'פרוייקט', 'project'],
        }
        
        changes = {}
        
        # Process each course
        for course_number, course_data in courses.items():
            course_name = course_data.get('name', '').lower()
            course_changes = {
                'name': course_data.get('name', ''),
                'original_types': set(),
                'detected_type': '',
                'changes_made': []
            }
            
            # Get current lesson types
            if 'groups' in course_data:
                for group in course_data['groups']:
                    if 'lessons' in group:
                        for lesson in group['lessons']:
                            if 'type' in lesson:
                                course_changes['original_types'].add(lesson['type'])
            
            # Detect type from title
            detected_type = ''
            for course_type, keywords in type_keywords.items():
                if any(keyword.lower() in course_name for keyword in keywords):
                    detected_type = course_type
                    break
            
            course_changes['detected_type'] = detected_type
            
            # If we found a type from the title and it differs from current types
            if detected_type and detected_type not in course_changes['original_types']:
                # Update the course type in all lessons
                if 'groups' in course_data:
                    for group in course_data['groups']:
                        if 'lessons' in group:
                            for lesson in group['lessons']:
                                if 'type' in lesson:
                                    old_type = lesson['type']
                                    lesson['type'] = detected_type
                                    course_changes['changes_made'].append(
                                        f"Changed type from '{old_type}' to '{detected_type}'"
                                    )
            
            # Only include courses where changes were made
            if course_changes['changes_made']:
                changes[course_number] = course_changes
        
        # Save the updated data back to the file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
            
        return changes 

    def repair_course_links(self, json_file_path: str) -> Dict[str, Dict]:
        """
        Repair course links by adding the correct group number from the course data.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            
        Returns:
            Dictionary containing statistics about the changes made
        """
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        changes = {
            'courses_modified': 0,
            'modified_courses': {}
        }
        
        BASE_URL = "https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}{group}&year={year}"
        
        for course_number, course_data in courses.items():
            current_link = course_data.get('course_link', '')
            if not current_link:
                continue
                
            # Get the first group from course data
            if 'groups' in course_data and course_data['groups']:
                first_group = course_data['groups'][0]
                group_code = first_group.get('group', '01')  # Default to '01' if no group found
                
                # Extract year from current link
                year_match = re.search(r'year=(\d{4})', current_link)
                if year_match:
                    year = year_match.group(1)
                    
                    # Generate the correct URL
                    correct_url = BASE_URL.format(
                        course_number=course_number,
                        group=group_code,
                        year=year
                    )
                    
                    # Check if the URL needs to be updated
                    if current_link != correct_url:
                        changes['courses_modified'] += 1
                        changes['modified_courses'][course_number] = {
                            'name': course_data.get('name', ''),
                            'old_link': current_link,
                            'new_link': correct_url,
                            'group': group_code
                        }
                        
                        # Update the course link
                        courses[course_number]['course_link'] = correct_url
        
        # Save the updated data back to the file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
            
        # Print summary
        print(f"\nProcessing completed for {json_file_path}!")
        print(f"Modified {changes['courses_modified']} course links")
        
        if changes['courses_modified'] > 0:
            print("\nModified courses:")
            for course_num, change_data in changes['modified_courses'].items():
                print(f"\nCourse {course_num} - {change_data['name']}:")
                print(f"Group: {change_data['group']}")
                print(f"Old link: {change_data['old_link']}")
                print(f"New link: {change_data['new_link']}")
        
        return changes

if __name__ == "__main__":
    # Get course types
    tools_course = ToolsCourse()
    tools_course.repair_course_links('courses/JSONs/physics.json')