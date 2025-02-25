import json
import requests
from bs4 import BeautifulSoup
import re
import time
from typing import Dict
import os
import traceback


class CourseProcessor:

    def filter_exact_sciences_courses(self, input_file: str = 'exact_sciences_2021-2025.json', 
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
        # Convert semester 'a'/'b' to '1'/'2' and create the year_sem parameter
        sem_num = '1' if semester.lower() == 'a' else '2'
        year_sem = f"{int(year)-1}{sem_num}"  # Use previous year for semester
        
        # Base URL for TAU course requirements
        BASE_PREQ_PAREQ_URL = "https://www.ims.tau.ac.il/Tal/kr/Drishot_L.aspx?kurs={course_number}&sem={year_sem}"
        
        # Generate URL
        preq_url = BASE_PREQ_PAREQ_URL.format(
            course_number=course_number,
            year_sem=year_sem
        )
        
        # Initialize prerequisites and parallel requirements lists
        preq_list = []
        pareq_list = []
        
        # Fetch and parse the prerequisites page
        response = requests.get(preq_url)
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
            'pareq': pareq_list
        }

    def get_course_link(self, course_number: str, year: str, semester: str) -> Dict:
        """
        Generate the course link URL.
        
        Args:
            course_number: Course number without dashes
            year: Academic year
            semester: Semester ('a' or 'b')
            
        Returns:
            Dictionary containing the course link
        """
        # Base URL for TAU course information
        BASE_COURSE_LINK_URL = "https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}&year={year}"
        
        # Default group code
        group_code = "01"
        
        course_url = BASE_COURSE_LINK_URL.format(
            course_number=f"{course_number}{group_code}",
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

    def complete_course_data(self, json_file_path: str) -> Dict:
        """
        Add course link, prerequisites, parallel requirements, and evaluation type to courses data.
        
        Args:
            json_file_path: Path to JSON file containing course data
            
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

                # Get the most recent offering details
                year = course_data['last_offered']['year']
                semester = course_data['last_offered']['semester']
                
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
                        print(f"Found {len(req_data['preq'])} prerequisites and {len(req_data['pareq'])} parallel requirements")
                    except Exception as e:
                        print(f"Error getting requirements: {e}")
                        course_data['preq'] = []
                        course_data['pareq'] = []
                
                success_count += 1
                print(f"Successfully processed course {course_number}")
                
                # Add a small delay to avoid overwhelming the server
                time.sleep(0.1)
                
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

    def delete_tirgulim(self, json_file_path: str):
        """
        Delete all tirgulim (of type "תרגיל") from the JSON course data.
        
        Args:
            json_file_path: Path to JSON file containing course data
        """
        # Load the course data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            courses = json.load(f)
            
        print(f"\nStarting to remove tirgulim from {json_file_path}")
        print(f"Original number of courses: {len(courses)}")
        
        # Track statistics
        total_groups_removed = 0
        courses_modified = 0
        
        # Process each course
        for course_number, course_data in courses.items():
            if 'groups' in course_data:
                # Keep only groups that don't have any תרגיל lessons
                original_group_count = len(course_data['groups'])
                filtered_groups = [
                    group for group in course_data['groups']
                    if not any(
                        lesson.get('type') == 'תרגיל'
                        for lesson in group.get('lessons', [])
                    )
                ]
                
                # Update groups if any were removed
                if len(filtered_groups) != original_group_count:
                    groups_removed = original_group_count - len(filtered_groups)
                    total_groups_removed += groups_removed
                    courses_modified += 1
                    course_data['groups'] = filtered_groups
                    print(f"Removed {groups_removed} tirgul groups from course {course_number}")
        
        # Save the updated data
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
            
        # Print summary
        print("\nProcessing completed!")
        print(f"Modified {courses_modified} courses")
        print(f"Removed {total_groups_removed} total tirgul groups")

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