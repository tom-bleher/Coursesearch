import json
import requests
import time
from typing import Optional, List, Dict, Union, Set
from datetime import datetime
from bs4 import BeautifulSoup
import re
import os
import sqlite3
from statistics import mean

class CourseDownloader:
    """Class to handle downloading and filtering TAU course data from Arazim Project database"""
    
    BASE_URL = "https://arazim-project.com/data"
    ALL_COURSES_URL = f"{BASE_URL}/courses.json"
    
    def __init__(self):
        # Cache the all courses data to avoid multiple downloads
        self.all_courses: Optional[Dict] = None
    
    def fetch_courses(self, 
                        years: Optional[Union[str, List[str]]] = None,
                        semesters: Optional[Union[str, List[str]]] = None,
                        faculty: Optional[str] = None,
                        departments: Optional[List[str]] = None,
                        save_to_file: Optional[bool] = True,
                        merge: Optional[bool] = False,
                        fetch_grades: Optional[bool] = False) -> Dict:
        """
        Download and filter course data based on specified criteria
        
        Args:
            years: Specific year(s) to download (e.g., '2025' or ['2024', '2025'])
            semesters: Specific semester(s) to download ('a', 'b', or ['a', 'b']). If None, gets year data without semester
            faculty: Filter courses by faculty name (e.g., 'מדעים מדויקים')
            departments: Filter courses by department name (e.g., ['פיזיקה', 'מתמטיקה'])
            save_to_file: Whether to save the results to JSON files
            merge: Whether to merge courses from multiple years, keeping only the latest offering of each course
            fetch_grades: Whether to fetch grades for the courses
            
        Returns:
            Dictionary containing the filtered course data
            
        Raises:
            ValueError: If no courses found for the specified faculty/department combination
        """
        
        # Handle single year/semester input
        if isinstance(years, str):
            years = [years]
        if isinstance(semesters, str):
            semesters = [semesters.lower()]
            
        # Validate semesters if provided
        if semesters:
            for sem in semesters:
                if sem not in ['a', 'b']:
                    raise ValueError("Semesters must be 'a' or 'b'")

        # If no specific years requested, get all courses
        if not years:
            return self._get_all_courses(faculty, departments, save_to_file)
            
        results = {}
        merged_courses = {}
        
        # Sort years in descending order to process most recent first
        years.sort(reverse=True)
        
        # Download specific year/semester combinations
        for year in years:
            if semesters:
                # Sort semesters in descending order ('b' before 'a')
                sorted_semesters = sorted(semesters, reverse=True)
                # Get semester-specific data
                for semester in sorted_semesters:
                    url = f"{self.BASE_URL}/courses-{year}{semester}.json"
                    try:
                        response = requests.get(url)
                        response.raise_for_status()
                        data = response.json()
                        
                        # Filter by faculty and department
                        filtered_data = {}
                        for k, v in data.items():
                            course_faculty = v.get('faculty', '').split('/')
                            if len(course_faculty) < 2:
                                continue
                                
                            main_faculty, dept = course_faculty[0], course_faculty[1]
                            
                            if faculty and faculty.lower() != main_faculty.lower():
                                continue
                                
                            if departments and not any(dep.lower() == dept.lower() for dep in departments):
                                continue
                                
                            filtered_data[k] = v
                            # Add last_offered information
                            filtered_data[k]['last_offered'] = f"{year}{semester}"
                            
                            # If merging, update merged_courses with this course if it's newer
                            if merge:
                                if k not in merged_courses or \
                                   filtered_data[k]['last_offered'] > merged_courses[k]['last_offered']:
                                    merged_courses[k] = filtered_data[k]
                            
                        if not filtered_data:
                            raise ValueError(f"No courses found for faculty '{faculty}' and departments {departments}")
                            
                        results[f"{year}{semester}"] = filtered_data
                        
                        if save_to_file and not merge:
                            filename = f"{year}{semester}-{faculty.replace(' ', '_')}"
                            if departments:
                                filename += f"-{'_'.join(dep.replace(' ', '_') for dep in departments)}"
                            filename += ".json"
                            self._save_to_file(filtered_data, filename)
                            
                    except requests.RequestException as e:
                        print(f"Failed to download {url}: {e}")
            else:
                # When no semester specified, fetch and merge both semesters
                merged_data = {}
                for semester in ['b', 'a']:  # Process 'b' before 'a' to keep latest
                    url = f"{self.BASE_URL}/courses-{year}{semester}.json"
                    try:
                        response = requests.get(url)
                        response.raise_for_status()
                        semester_data = response.json()
                        
                        # Filter by faculty and department
                        for k, v in semester_data.items():
                            course_faculty = v.get('faculty', '').split('/')
                            if len(course_faculty) < 2:
                                continue
                                
                            main_faculty, dept = course_faculty[0], course_faculty[1]
                            
                            if faculty and faculty.lower() != main_faculty.lower():
                                continue
                                
                            if departments and not any(dep.lower() == dept.lower() for dep in departments):
                                continue
                                
                            # Add last_offered information
                            v['last_offered'] = f"{year}{semester}"
                            
                            # Update merged_data with this course if it's newer
                            if k not in merged_data or \
                               v['last_offered'] > merged_data[k]['last_offered']:
                                merged_data[k] = v
                                
                            # If merging across years, also update merged_courses
                            if merge:
                                if k not in merged_courses or \
                                   v['last_offered'] > merged_courses[k]['last_offered']:
                                    merged_courses[k] = v
                            
                    except requests.RequestException as e:
                        print(f"Failed to download {url}: {e}")
                
                if not merged_data:
                    raise ValueError(f"No courses found for faculty '{faculty}' and departments {departments}")
                
                results[year] = merged_data
                
                if save_to_file and not merge:
                    filename = f"{year}-{faculty.replace(' ', '_')}"
                    if departments:
                        filename += f"-{'_'.join(dep.replace(' ', '_') for dep in departments)}"
                    filename += ".json"
                    self._save_to_file(merged_data, filename)
        
        # If merging was requested, save merged results and return them
        if merge:
            if save_to_file:
                # Create filename for merged data
                if len(years) > 1:
                    years_range = f"{min(years)}-{max(years)}"
                else:
                    years_range = years[0]
                filename = f"{years_range}-{faculty.replace(' ', '_')}"
                if departments:
                    filename += f"-{'_'.join(dep.replace(' ', '_') for dep in departments)}"
                filename += ".json"
                self._save_to_file(merged_courses, filename)
            return merged_courses
                    
        # After filtering courses and before returning/saving:
        if fetch_grades:
            print("\nFetching grades for courses...")
            grades_data = self.fetch_grades_for_courses(results)
            
            # Add average grades to course data
            for course_code, course_data in results.items():
                if course_code in grades_data:
                    course_data['avg_grade'] = grades_data[course_code].get('avg_grade')
        
        return results
    
    def _get_all_courses(self, faculty: Optional[str] = None, departments: Optional[List[str]] = None, save_to_file: bool = True) -> Dict:
        """Get the complete courses dataset"""
        if not self.all_courses:
            response = requests.get(self.ALL_COURSES_URL)
            response.raise_for_status()
            self.all_courses = response.json()
        
        filtered_data = {k: v for k, v in self.all_courses.items() 
                        if (not faculty or faculty.lower() in v.get('faculty', '').lower()) and
                        (not departments or any(dep in v.get('department', '') for dep in departments))}
        
        if save_to_file:
            # Create descriptive filename based on filters
            filename_parts = [""]
            if faculty:
                filename_parts.append(faculty.replace(" ", "_"))
            if departments:
                filename_parts.append("-".join(dep.replace(" ", "_") for dep in departments))
            if not faculty and not departments:
                filename_parts.append("all")
            
            filename = f"{'-'.join(filename_parts)}.json"
            self._save_to_file(filtered_data, filename)
            
        return filtered_data
    
    @staticmethod
    def _save_to_file(data: Dict, filename: str):
        """Save data to a JSON file"""
        # Get the directory of the current file (fetch_courses.py)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Create full path for the output file
        output_path = os.path.join(current_dir, filename)
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save the file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def get_available_faculties(self) -> List[str]:
        """Get a list of all available faculties"""
        if not self.all_courses:
            self._get_all_courses(save_to_file=False)
            
        faculties = set()
        for course in self.all_courses.values():
            if 'faculty' in course:
                faculties.add(course['faculty'])
        return sorted(list(faculties))
    
    def fetch_course_grades(self, course_code: str) -> Dict:
        """
        Fetch all-time average grade and distribution for a specific course.
        Ignores grades of 0.0 in the calculation.
        
        Args:
            course_code: The course number to fetch grades for
            
        Returns:
            Dictionary containing the average grade and distribution if available
        """
        GRADES_URL = "https://arazim-project.com/data/grades.json"
        
        try:
            response = requests.get(GRADES_URL)
            response.raise_for_status()
            all_grades = response.json()
            
            # Get grades for specific course
            course_grades = all_grades.get(course_code, {})
            
            if not course_grades:
                return {}
            
            # Calculate average grade across all years/semesters/groups
            all_means = []
            total_distribution = [0] * 101  # Initialize distribution array (0-100)
            
            for semester, groups in course_grades.items():
                for group_num, grade_infos in groups.items():
                    for grade_info in grade_infos:
                        if isinstance(grade_info, dict):
                            mean_grade = grade_info.get('mean')
                            distribution = grade_info.get('distribution', [])
                            
                            # Add to total distribution if available
                            if distribution:
                                for i, count in enumerate(distribution):
                                    total_distribution[i] += count
                                    
                            # Only include non-zero grades for average
                            if mean_grade is not None and mean_grade != 0.0:
                                all_means.append(mean_grade)
            
            result = {}
            
            # Calculate overall average if we have valid grades
            if all_means:
                result['avg_grade'] = round(sum(all_means) / len(all_means), 2)
                result['grades_counted'] = len(all_means)
                
            # Include distribution if we have any data
            if any(x > 0 for x in total_distribution):
                result['distribution'] = total_distribution
                
            return result
            
        except Exception as e:
            print(f"Error fetching grades for course {course_code}: {e}")
            return {}

    def fetch_grades_for_courses(self, courses: Dict, save_to_file: bool = True) -> Dict:
        """
        Fetch grades for a set of courses and optionally save to file
        
        Args:
            courses: Dictionary of courses to fetch grades for
            save_to_file: Whether to save grades to a JSON file
            
        Returns:
            Dictionary mapping course codes to their grade data
        """
        grades_data = {}
        
        for course_code in courses.keys():
            print(f"Fetching grades for course {course_code}")
            grades = self.fetch_course_grades(course_code)
            if grades:
                grades_data[course_code] = grades
                
        if save_to_file and grades_data:
            # Create grades directory if it doesn't exist
            current_dir = os.path.dirname(os.path.abspath(__file__))
            grades_dir = os.path.join(current_dir, 'grades')
            os.makedirs(grades_dir, exist_ok=True)
            
            # Save grades data
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"grades_{timestamp}.json"
            output_path = os.path.join(grades_dir, filename)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(grades_data, f, ensure_ascii=False, indent=2)
            print(f"Saved grades data to {output_path}")
        
        return grades_data

if __name__ == "__main__":
    downloader = CourseDownloader()
    print(downloader.fetch_courses(years=['2025', '2024', '2023', '2022', '2021'], faculty='מדעים מדויקים', departments=['פיזיקה', 'מתמטיקה'], merge=True))