import json
import requests
from bs4 import BeautifulSoup
import re
import time
from typing import Dict, List, Optional
import os
import traceback
import random


class CourseProcessor:

    def __init__(self):
        # Define delay ranges in seconds
        self.min_delay = 3.0
        self.max_delay = 5.0

    def _random_delay(self):
        """Add a random delay between requests to prevent rate limiting."""
        delay = random.uniform(self.min_delay, self.max_delay)
        time.sleep(delay)

    def get_req(self, course_number: str, year: str, semester: str) -> Dict:
        """
        Get prerequisites and parallel requirements for a course.
        
        Args:
            course_number: Course number without dashes
            year: Academic year
            semester: Semester ('a' or 'b')
            
        Returns:
            Dictionary containing prerequisites and parallel requirements lists
        """
        # Add delay before making request
        self._random_delay()
        
        # Convert semester 'a'/'b' to '1'/'2' and create the year_sem parameter
        sem_num = '1' if semester.lower() == 'a' else '2'
        year_sem = f"{int(year)-1}{sem_num}"  # Use previous year for semester
        
        # Base URL for TAU course requirements
        BASE_PREQ_PAREQ_URL = "https://www.ims.tau.ac.il/Tal/kr/Drishot_L.aspx?kurs={course_number}&sem={year_sem}"
        
        # Generate URL
        req_url = BASE_PREQ_PAREQ_URL.format(
            course_number=course_number,
            year_sem=year_sem
        )
        
        # Initialize prerequisites and parallel requirements lists
        preq_list = []
        pareq_list = []
        
        # Fetch and parse the prerequisites page
        response = requests.get(req_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the course number in the page title
        course_title = soup.find('span', class_='listtd')
        if not course_title:
            return {'preq': [], 'pareq': []}
            
        # Extract course number from title using regex
        match = re.search(r'\((\d{4}-\d{4})\)', course_title.text)
        if not match:
            return {'preq': [], 'pareq': []}
            
        # Verify the course number matches
        page_course_number = match.group(1).replace('-', '')
        if page_course_number != course_number:
            return {'preq': [], 'pareq': []}
            
        # Find all table headers
        headers = soup.find_all('th', class_='listth')
        
        for header in headers:
            if 'קורסי קדם נדרשים' in header.text:
                # Get prerequisites table
                preq_table = header.find_next('table', class_='listtds')
                if preq_table:
                    for row in preq_table.find_all('tr'):
                        cols = row.find_all('td')
                        if cols and len(cols) >= 1:
                            # Remove dash from course number
                            course_num = cols[0].text.strip().replace('-', '')
                            preq_list.append(course_num)
                            
            elif 'קורסים מקבילים נדרשים' in header.text:
                # Get parallel requirements table
                pareq_table = header.find_next('table', class_='listtds')
                if pareq_table:
                    for row in pareq_table.find_all('tr'):
                        cols = row.find_all('td')
                        if cols and len(cols) >= 1:
                            # Remove dash from course number
                            course_num = cols[0].text.strip().replace('-', '')
                            pareq_list.append(course_num)
        
        return {
            'preq': preq_list,
            'pareq': pareq_list,
            'req_url': req_url
        }

    def get_course_link(self, course_number: str, year: str, semester: str) -> Dict:
        """
        Generate the course link URL using the first available group number.
        
        Args:
            course_number: Course number without dashes
            year: Academic year
            semester: Semester ('a' or 'b')
            
        Returns:
            Dictionary containing the course link
        """
        # Add delay before making request
        self._random_delay()
        
        # Base URL for TAU course information
        BASE_COURSE_LINK_URL = "https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}{group}&year={year}"
        
        # Load the course data to get the group number
        json_file_path = os.path.join('courses', 'JSONs', 'math.json')  # You might need to adjust this path
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
        
        # Get the first available group number for this course
        group_code = "01"  # Default fallback
        if course_number in courses:
            course_data = courses[course_number]
            if 'groups' in course_data and course_data['groups']:
                first_group = course_data['groups'][0]
                if 'group' in first_group:
                    group_code = first_group['group']
        
        course_url = BASE_COURSE_LINK_URL.format(
            course_number=course_number,
            group=group_code,
            year=str(int(year)-1)
        )
        
        return {
            'course_link': course_url
        }
    
    def get_eval_type(self, course_number: str, year: str, semester: str) -> Dict:
        """
        Get the evaluation type for a course.
        
        Args:
            course_number: Course number without dashes
            year: Academic year
            semester: Semester ('a' or 'b')
            
        Returns:
            Dictionary containing the evaluation type
        """
        # Add delay before making request
        self._random_delay()
        
        # Get the course link first
        course_url = self.get_course_link(course_number, year, semester)['course_link']
        
        try:
            # Use headers that mimic a real browser to get the full HTML
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            }
            
            course_response = requests.get(course_url, headers=headers)
            course_response.raise_for_status()
            
            # Get the raw HTML content
            html_content = course_response.text
            
            # Initialize eval_type
            eval_type = ''
            
            # PATTERN 1: Hebrew structure - מטלות הקורס
            pattern_he = r'<small class="data-table-cell-label">מטלות הקורס</small>\s*<p><strong>(.*?)</strong></p>'
            match_he = re.search(pattern_he, html_content, re.DOTALL)
            
            # PATTERN 2: English structure - Course Requirements
            pattern_en = r'<small class="data-table-cell-label">Course Requirements</small>\s*<p><strong>(.*?)</strong></p>'
            match_en = re.search(pattern_en, html_content, re.DOTALL)
            
            if match_he:
                eval_type = match_he.group(1).strip()
            elif match_en:
                eval_type = match_en.group(1).strip()
            
            # PATTERN 3: More general pattern for both languages
            if not eval_type:
                pattern_general_he = r'מטלות הקורס.*?<p><strong>(.*?)</strong></p>'
                pattern_general_en = r'Course Requirements.*?<p><strong>(.*?)</strong></p>'
                
                match_general_he = re.search(pattern_general_he, html_content, re.DOTALL)
                match_general_en = re.search(pattern_general_en, html_content, re.DOTALL)
                
                if match_general_he:
                    eval_type = match_general_he.group(1).strip()
                elif match_general_en:
                    eval_type = match_general_en.group(1).strip()
            
            # PATTERN 4: Direct string check for common evaluation types
            if not eval_type:
                # Both Hebrew and English common evaluation types
                common_types = [
                    'בחינה סופית', 'Final Exam', 
                    'בחינה', 'Exam',
                    'בחינת ביניים', 'Midterm Exam',
                    'עבודה', 'Assignment',
                    'פרויקט', 'Project',
                    'מטלות', 'Tasks',
                    'תרגילים', 'Exercises',
                    'נוכחות', 'Attendance',
                    'הגשה', 'Submission',
                    'אחר', 'Other'
                ]
                
                for type_text in common_types:
                    if f'<strong>{type_text}</strong>' in html_content:
                        eval_type = type_text
                        break
            
            # If previous attempts failed, use BeautifulSoup as fallback
            if not eval_type:
                course_soup = BeautifulSoup(html_content, 'html.parser', from_encoding='utf-8')
                
                # Find the div with id "div_data_Matalot"
                matalot_div = course_soup.find('div', id='div_data_Matalot')
                if matalot_div:
                    # Look for Hebrew label
                    course_requirements_label = matalot_div.find('small', string='מטלות הקורס')
                    # If not found, try English label
                    if not course_requirements_label:
                        course_requirements_label = matalot_div.find('small', string='Course Requirements')
                    
                    if course_requirements_label:
                        # Get the parent cell
                        parent_cell = course_requirements_label.parent
                        if parent_cell:
                            # Find the first p > strong in this cell
                            strong_tag = parent_cell.find('p').find('strong') if parent_cell.find('p') else None
                            if strong_tag and strong_tag.text.strip():
                                eval_type = strong_tag.text.strip()
            
            # For completely empty content, use placeholder
            if not eval_type and matalot_div and not matalot_div.text.strip():
                eval_type = 'Not specified'
            
            # Clean up HTML tags in the evaluation type
            if eval_type:
                # Replace <br>, <br/>, <br /> with spaces
                eval_type = re.sub(r'<br\s*/?>', ' ', eval_type)
                # Remove any other HTML tags
                eval_type = re.sub(r'<[^>]+>', '', eval_type)
                # Clean up any double spaces
                eval_type = re.sub(r'\s+', ' ', eval_type).strip()
            
            return {
                'eval_type': eval_type if eval_type else ''
            }
            
        except Exception as e:
            return {'eval_type': ''}

    def complete_course_data(self, json_file_path: str, limit: Optional[int] = None) -> Dict:
        """
        Add course link, prerequisites, parallel requirements, and evaluation type to courses data.
        
        Args:
            json_file_path: Path to JSON file containing course data
            limit: Optional maximum number of courses to process
            
        Returns:
            Updated course data dictionary
        """
        print(f"\nStarting to process courses from {json_file_path}")
        
        # Load existing course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
        print(f"Loaded {len(courses)} courses from file")
        
        # Skip courses that already have all required fields
        required_fields = {'eval_type', 'course_link', 'preq', 'pareq'}
        courses_to_process = {
            num: data for num, data in courses.items() 
            if not all(field in data for field in required_fields)
        }
        
        # Apply limit if specified
        if limit is not None:
            courses_to_process = dict(list(courses_to_process.items())[:limit])
            print(f"Limited to processing {limit} courses")
            
        print(f"Found {len(courses_to_process)} courses needing completion")
        
        # Track progress and statistics
        processed_count = 0
        success_count = 0
        error_count = 0
        
        for course_number, course_data in courses_to_process.items():
            processed_count += 1
            print(f"\nProcessing course {processed_count}/{len(courses_to_process)}: {course_number}")
            
            try:
                # Skip if all fields already exist
                if all(field in course_data for field in required_fields):
                    print(f"Course {course_number} already complete, skipping")
                    continue

                # Parse last_offered string into year and semester
                last_offered = course_data.get('last_offered', '')
                if not last_offered:
                    print(f"No last_offered data for course {course_number}, skipping")
                    continue
                    
                year = last_offered[:-1]  # Everything except last character
                semester = last_offered[-1].lower()  # Last character ('a' or 'b')
                
                # Process each required field if missing
                if 'course_link' not in course_data:
                    try:
                        link_data = self.get_course_link(course_number, year, semester)
                        course_data['course_link'] = link_data['course_link']
                        print(f"Added course link: {course_data['course_link']}")
                    except Exception as e:
                        print(f"Error getting course link: {e}")
                        course_data['course_link'] = ''
                
                if 'eval_type' not in course_data:
                    try:
                        eval_data = self.get_eval_type(course_number, year, semester)
                        course_data['eval_type'] = eval_data['eval_type']
                        if eval_data['eval_type']:
                            print(f"Found evaluation type: '{eval_data['eval_type']}'")
                        else:
                            print(f"Could not find evaluation type for {course_number}")
                    except Exception as e:
                        print(f"Error getting evaluation type: {e}")
                        course_data['eval_type'] = ''
                
                if 'preq' not in course_data or 'pareq' not in course_data:
                    try:
                        req_data = self.get_req(course_number, year, semester)
                        course_data['preq'] = req_data['preq']
                        course_data['pareq'] = req_data['pareq']
                        course_data['req_url'] = req_data['req_url']
                        print(f"Found {len(req_data['preq'])} prerequisites: {', '.join(req_data['preq']) if req_data['preq'] else 'None'}")
                        print(f"Found {len(req_data['pareq'])} parallel requirements: {', '.join(req_data['pareq']) if req_data['pareq'] else 'None'}")
                    except Exception as e:
                        print(f"Error getting requirements: {e}")
                        course_data['preq'] = []
                        course_data['pareq'] = []
                
                success_count += 1
                print(f"Successfully processed course {course_number}")
                
            except Exception as e:
                print(f"ERROR: Error processing course {course_number}: {e}")
                print(f"Stack trace: {traceback.format_exc()}")
                error_count += 1
                # Ensure all required fields exist even on error
                if 'preq' not in course_data:
                    course_data['preq'] = []
                if 'pareq' not in course_data:
                    course_data['pareq'] = []
                if 'eval_type' not in course_data:
                    course_data['eval_type'] = ''
                if 'course_link' not in course_data:
                    course_data['course_link'] = ''
                continue
        
        # Print final statistics
        print("\nProcessing completed!")
        print(f"Total courses processed: {processed_count}")
        print(f"Successfully processed: {success_count}")
        print(f"Errors encountered: {error_count}")
        if processed_count > 0:
            print(f"Success rate: {(success_count/processed_count)*100:.2f}%")
        else:
            print("Success rate: N/A - no courses needed processing")
        
        # Save the updated courses back to the file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
            
        print(f"\nSaved updated data for {processed_count} courses")
        
        return courses

    def delete_keys(self, json_file_path: str, keys: List[str]):
        """
        Delete specified keys from the JSON course data and perform additional filtering:
        - Remove groups with lesson type "תרגיל"
        - Extract lesson type to course-level property
        - Remove specified top-level keys
        
        Args:
            json_file_path: Path to JSON file containing course data
            keys: List of keys to delete from each course entry
        """
        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        print(f"\nStarting to remove keys {keys} from {json_file_path}")
        print(f"Original number of courses: {len(courses)}")
        
        # Track statistics
        total_keys_removed = 0
        courses_modified = 0
        
        # Process each course
        for course_number, course_data in courses.items():
            course_modified = False
            
            # Remove top-level keys
            for key in keys:
                if key in course_data:
                    del course_data[key]
                    total_keys_removed += 1
                    course_modified = True
                    print(f"Removed key '{key}' from course {course_number}")
            
            # Handle groups filtering and cleanup
            if 'groups' in course_data:
                # Filter out groups that have lessons with type "תרגיל"
                filtered_groups = []
                course_type = None
                
                for group in course_data['groups']:
                    if 'lessons' in group:
                        # Check if any lesson in this group is of type "תרגיל"
                        has_targil = any(
                            lesson.get('type') == 'תרגיל' 
                            for lesson in group['lessons']
                        )
                        
                        # Extract the first non-targil lesson type we find
                        if not course_type:
                            for lesson in group['lessons']:
                                if lesson.get('type') and lesson.get('type') != 'תרגיל':
                                    course_type = lesson.get('type')
                                    break
                        
                        if not has_targil:
                            # Create a new group without the lessons key
                            new_group = {k: v for k, v in group.items() if k != 'lessons'}
                            filtered_groups.append(new_group)
                    else:
                        # If no lessons key, keep the group as is
                        filtered_groups.append(group)
                
                # Update the groups with filtered version
                if filtered_groups:
                    course_data['groups'] = filtered_groups
                else:
                    # If all groups were filtered out, remove the groups key
                    del course_data['groups']
                
                # Add the course type as a top-level property if found
                if course_type:
                    course_data['type'] = course_type
                
                course_modified = True
            
            if course_modified:
                courses_modified += 1
        
        # Save the updated data
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
        
        # Print summary
        print("\nProcessing completed!")
        print(f"Modified {courses_modified} courses")
        print(f"Removed {total_keys_removed} total keys")

    def remove_logic_words(self, json_file_path: str, logic_words: List[str] = None) -> Dict[str, Dict]:
        """ 
        Remove logic words from the course data's prerequisites and parallel requirements.
        Handles equivalent words in Hebrew and English (e.g., 'או' and 'or' are treated as the same).
        Also removes 'תרגיל' entries.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            logic_words: Optional list of logic words to remove. Can include any of: ['או', 'or', 'וגם', 'and']
            
        Returns:
            Dictionary containing statistics about the changes made
        """
        # Define equivalent terms mapping
        LOGIC_WORD_EQUIVALENTS = {
            'או': {'או', 'or'},
            'or': {'או', 'or'},
            'וגם': {'וגם', 'and'},
            'and': {'וגם', 'and'}
        }
        
        # Validate logic words and expand to include equivalents
        valid_words = set(['או', 'וגם', 'or', 'and'])
        invalid_words = [word for word in logic_words if word not in valid_words]
        if invalid_words:
            raise ValueError(f"Invalid logic words provided: {invalid_words}")
            
        # Expand the logic words to include their equivalents
        expanded_logic_words = set()
        for word in logic_words:
            expanded_logic_words.update(LOGIC_WORD_EQUIVALENTS[word])

        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        # Track changes
        changes = {
            'courses_modified': 0,
            'total_words_removed': 0,
            'total_targil_removed': 0,
            'modified_courses': {}
        }
        
        # Process each course
        for course_number, course_data in courses.items():
            course_modified = False
            course_changes = {
                'preq_removed': [],
                'pareq_removed': [],
                'targil_removed': []
            }
            
            # Clean prerequisites
            if 'preq' in course_data:
                original_preq = course_data['preq'].copy()
                # Remove logic words and תרגיל entries
                course_data['preq'] = [x for x in course_data['preq'] if x not in expanded_logic_words and not x.endswith('01')]
                removed_preq = [x for x in original_preq if x in expanded_logic_words]
                removed_targil = [x for x in original_preq if x.endswith('01')]
                if removed_preq or removed_targil:
                    course_modified = True
                    course_changes['preq_removed'] = removed_preq
                    course_changes['targil_removed'].extend(removed_targil)
                    changes['total_words_removed'] += len(removed_preq)
                    changes['total_targil_removed'] += len(removed_targil)
            
            # Clean parallel requirements
            if 'pareq' in course_data:
                original_pareq = course_data['pareq'].copy()
                # Remove logic words and תרגיל entries
                course_data['pareq'] = [x for x in course_data['pareq'] if x not in expanded_logic_words and not x.endswith('01')]
                removed_pareq = [x for x in original_pareq if x in expanded_logic_words]
                removed_targil = [x for x in original_pareq if x.endswith('01')]
                if removed_pareq or removed_targil:
                    course_modified = True
                    course_changes['pareq_removed'] = removed_pareq
                    course_changes['targil_removed'].extend(removed_targil)
                    changes['total_words_removed'] += len(removed_pareq)
                    changes['total_targil_removed'] += len(removed_targil)
            
            # Record changes if any were made
            if course_modified:
                changes['courses_modified'] += 1
                changes['modified_courses'][course_number] = course_changes
        
        # Save the updated data back to the file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
            
        # Print summary
        print(f"\nProcessing completed!")
        print(f"Modified {changes['courses_modified']} courses")
        print(f"Removed {changes['total_words_removed']} logic words")
        print(f"Removed {changes['total_targil_removed']} תרגיל entries")
        
        if changes['total_words_removed'] > 0 or changes['total_targil_removed'] > 0:
            print("\nDetailed changes by course:")
            for course_num, course_changes in changes['modified_courses'].items():
                print(f"\nCourse {course_num}:")
                if course_changes['preq_removed']:
                    print(f"  Removed prerequisites (logic words): {', '.join(course_changes['preq_removed'])}")
                if course_changes['pareq_removed']:
                    print(f"  Removed parallel requirements (logic words): {', '.join(course_changes['pareq_removed'])}")
                if course_changes['targil_removed']:
                    print(f"  Removed תרגיל entries: {', '.join(course_changes['targil_removed'])}")
        
        return changes

    def split_by_department(self, json_file_path: str, department: str = None) -> Dict[str, int]:
        """
        Create JSON files for each department. If a specific department is provided,
        creates only that department's JSON. Otherwise creates JSONs for all departments.
        
        Args:
            json_file_path: Path to the input JSON file
            department: Optional specific department to process
            
        Returns:
            Dictionary with department names as keys and number of courses as values
        """
        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        # Dictionary to store courses by department
        departments = {}
        
        # Process each course
        for course_number, course_data in courses.items():
            # Get faculty and extract department
            faculty = course_data.get('faculty', '')
            if 'מדעים מדויקים/' in faculty:
                dept = faculty.split('/')[-1]
                
                # Skip if specific department requested and this isn't it
                if department and department != dept:
                    continue
                
                # Initialize department dict if needed
                if dept not in departments:
                    departments[dept] = {}
                
                # Add course to department
                departments[dept][course_number] = course_data
        
        # Create output directory if it doesn't exist
        output_dir = os.path.dirname(json_file_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        # Save department files and count courses
        dept_counts = {}
        for dept, dept_courses in departments.items():
            # Create filename - replace spaces and special characters
            filename = dept.replace(' ', '_').replace('/', '_')
            output_path = os.path.join(output_dir, f"{filename}.json")
            
            # Save department courses
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(dept_courses, f, ensure_ascii=False, indent=2)
            
            dept_counts[dept] = len(dept_courses)
            print(f"Created {output_path} with {len(dept_courses)} courses")
        
        return dept_counts

    def reorgnize_keys(self, json_file_path: str) -> Dict[str, int]:
        """
        Reorganize the keys in each course entry to maintain a consistent order.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            
        Returns:
            Dictionary with statistics about the changes made
        """
        # Define the desired key order
        key_order = [
            "name",
            "faculty",
            "type",
            "groups",
            "preq",
            "pareq",
            "last_offered",
            "eval_type",
            "course_link",
            "req_url"
        ]
        
        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
        
        # Track statistics
        stats = {
            'courses_processed': 0,
            'courses_modified': 0
        }
        
        # Process each course
        reorganized_courses = {}
        for course_number, course_data in courses.items():
            stats['courses_processed'] += 1
            
            # Create new ordered dictionary for this course
            ordered_course = {}
            
            # Add keys in specified order
            for key in key_order:
                if key in course_data:
                    ordered_course[key] = course_data[key]
            
            # Add any remaining keys that weren't in our order list
            for key, value in course_data.items():
                if key not in ordered_course:
                    ordered_course[key] = value
            
            # Check if the order changed
            if list(ordered_course.keys()) != list(course_data.keys()):
                stats['courses_modified'] += 1
            
            reorganized_courses[course_number] = ordered_course
        
        # Save the reorganized data back to the file
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(reorganized_courses, f, ensure_ascii=False, indent=2)
        
        # Print summary
        print(f"\nReorganization completed!")
        print(f"Processed {stats['courses_processed']} courses")
        print(f"Modified order in {stats['courses_modified']} courses")
        
        return stats
    
if __name__ == "__main__":
    processor = CourseProcessor()
    processor.reorgnize_keys("courses/JSONs/physics.json")