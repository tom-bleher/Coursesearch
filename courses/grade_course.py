import json
import requests
import matplotlib
matplotlib.use('TkAgg')  # Add this line to specify the backend
import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict
import os
from datetime import datetime

class gradeCourse:
    def __init__(self):
        pass


    def print_course_average(self, json_file_path: str, course_number: str) -> None:
        """
        Print detailed grade information for a specific course.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            course_number: The course number to look up
        """
        try:
            # Load local course data
            with open(json_file_path, 'r', encoding='utf-8') as f:
                courses = json.load(f)
            
            course_data = courses.get(course_number)
            if not course_data:
                print(f"Course {course_number} not found in {json_file_path}")
                return

            # Print course details
            print("\n" + "=" * 50)
            print("COURSE DETAILS")
            print("=" * 50)
            for key, value in course_data.items():
                if key != 'groups':  # We'll handle groups separately
                    print(f"{key}: {value}")
            
            # Print group information if available
            if 'groups' in course_data:
                print("\n" + "=" * 50)
                print("GROUP INFORMATION")
                print("=" * 50)
                for group in course_data['groups']:
                    print("\nGroup:", group.get('group', 'N/A'))
                    for key, value in group.items():
                        if key != 'lessons':  # We'll handle lessons separately
                            print(f"{key}: {value}")
                    
                    if 'lessons' in group:
                        print("\nLessons:")
                        for lesson in group['lessons']:
                            print("-" * 30)
                            for key, value in lesson.items():
                                print(f"  {key}: {value}")
            
            # Fetch and print grade history
            print("\n" + "=" * 50)
            print("GRADE HISTORY")
            print("=" * 50)
            
            GRADES_URL = "https://arazim-project.com/data/grades.json"
            response = requests.get(GRADES_URL)
            response.raise_for_status()
            all_grades = response.json()
            
            course_grades = all_grades.get(course_number, {})
            if not course_grades:
                print("No grade history available")
                return
            
            # Sort semesters for chronological display
            sorted_semesters = sorted(course_grades.keys())
            
            for semester in sorted_semesters:
                print(f"\nSemester: {semester}")
                print("-" * 30)
                
                for group_num, grade_infos in course_grades[semester].items():
                    for grade_info in grade_infos:
                        if isinstance(grade_info, dict):
                            print(f"Group {group_num}:")
                            # Print all available grade information
                            for key, value in grade_info.items():
                                if key != 'distribution':
                                    print(f"  {key}: {value}")
                            
                            # Handle distribution separately
                            if 'distribution' in grade_info:
                                print("  Grade Distribution:")
                                dist = grade_info['distribution']
                                if isinstance(dist, list):
                                    for grade_range in dist:
                                        if isinstance(grade_range, dict):
                                            print(f"    {grade_range.get('range', 'N/A')}: {grade_range.get('count', 'N/A')} students")
                                elif isinstance(dist, dict):
                                    for grade_range, count in dist.items():
                                        print(f"    {grade_range}: {count} students")
                                else:
                                    print(f"    Raw distribution data: {dist}")
                            print()
                
        except FileNotFoundError:
            print(f"File not found: {json_file_path}")
        except json.JSONDecodeError:
            print(f"Error reading JSON file: {json_file_path}")
        except requests.RequestException as e:
            print(f"Error fetching grade data: {e}")
        except Exception as e:
            print(f"An error occurred: {e}")
            raise  # This will help with debugging by showing the full error trace

    def plot_grade_distribution(self, json_file_path: str, course_number: str) -> None:
        """
        Create and display a histogram of all-time grade distributions for a course.
        
        Args:
            json_file_path: Path to the JSON file containing course data
            course_number: The course number to look up
        """
        try:
            # Fetch grade data
            GRADES_URL = "https://arazim-project.com/data/grades.json"
            response = requests.get(GRADES_URL)
            response.raise_for_status()
            all_grades = response.json()
            
            course_grades = all_grades.get(course_number, {})
            if not course_grades:
                print("No grade history available")
                return
            
            # Aggregate all distributions
            total_distribution = defaultdict(int)
            semester_count = 0
            
            # Define standard grade ranges
            grade_ranges = ['0-49', '50-59', '60-64', '65-69', '70-74', 
                          '75-79', '80-84', '85-89', '90-94', '95-100']
            
            for semester, groups in course_grades.items():
                for group_num, grade_infos in groups.items():
                    for grade_info in grade_infos:
                        if isinstance(grade_info, dict):
                            dist = grade_info.get('distribution')
                            if dist is not None:
                                # Handle list format (direct counts for each range)
                                if isinstance(dist, list):
                                    # If length matches our grade ranges, assume it's in order
                                    if len(dist) == len(grade_ranges):
                                        for i, count in enumerate(dist):
                                            total_distribution[grade_ranges[i]] += count
                                    else:
                                        print(f"Warning: Unexpected distribution list length: {len(dist)}")
                                        continue
                                
                                # Handle dictionary format
                                elif isinstance(dist, dict):
                                    for grade_range, count in dist.items():
                                        total_distribution[grade_range] += count
                                
                                semester_count += 1

            if not total_distribution:
                print("No distribution data could be constructed")
                return

            # Get course name
            with open(json_file_path, 'r', encoding='utf-8') as f:
                courses = json.load(f)
            course_name = courses.get(course_number, {}).get('name', course_number)

            # Prepare data for plotting
            counts = [total_distribution[range_] for range_ in grade_ranges]
            
            # Create the plot
            plt.figure(figsize=(12, 6))
            
            # Create bars
            x = np.arange(len(grade_ranges))
            plt.bar(x, counts, width=0.8, edgecolor='black')
            
            # Customize the plot
            plt.title(f'All-time Grade Distribution for {course_name} ({course_number})')
            plt.xlabel('Grade Ranges')
            plt.ylabel('Number of Students')
            
            # Rotate x-axis labels for better readability
            plt.xticks(x, grade_ranges, rotation=45)
            
            # Add value labels on top of each bar
            for i, count in enumerate(counts):
                plt.text(i, count, str(count), ha='center', va='bottom')
            
            # Add total students count
            total_students = sum(counts)
            plt.text(0.02, 0.98, f'Total Students: {total_students}', 
                    transform=plt.gca().transAxes, 
                    verticalalignment='top')
            
            # Adjust layout to prevent label cutoff
            plt.tight_layout()
            
            # Show the plot and block until window is closed
            plt.show(block=True)

        except Exception as e:
            print(f"An error occurred: {e}")
            import traceback
            traceback.print_exc()
            raise

    def save_grades(self):
        """
        Downloads and saves the grades data from Arazim website.
        Saves the raw JSON data to a file with timestamp.
        """
        GRADES_URL = "https://arazim-project.com/data/grades.json"
        
        try:
            # Download grades data
            print("Downloading grades data...")
            response = requests.get(GRADES_URL)
            response.raise_for_status()
            grades_data = response.json()
            
            # Create grades directory if it doesn't exist
            current_dir = os.path.dirname(os.path.abspath(__file__))
            grades_dir = os.path.join(current_dir, 'grades')
            os.makedirs(grades_dir, exist_ok=True)
            
            # Create filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"grades_{timestamp}.json"
            output_path = os.path.join(grades_dir, filename)
            
            # Save the data
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(grades_data, f, ensure_ascii=False, indent=2)
                
            print(f"Successfully saved grades data to {output_path}")
            return output_path
            
        except requests.RequestException as e:
            print(f"Error downloading grades data: {e}")
        except Exception as e:
            print(f"Error saving grades data: {e}")

    def plot_course_grade_distribution(self, grades_data, course_number):
        """
        Creates a histogram of grade distributions for a specific course.
        Sums up distributions across all semesters and groups.
        
        Args:
            grades_data: The complete grades JSON data
            course_number: The course number to analyze
        """
        if course_number not in grades_data:
            print(f"Course {course_number} not found in grades data")
            return
        
        # Grade ranges for x-axis
        grade_ranges = ['0-49', '50-59', '60-64', '65-69', '70-74', 
                    '75-79', '80-84', '85-89', '90-94', '95-100']
        
        # Initialize total distribution
        total_distribution = [0] * 10
        
        # Sum up distributions across all semesters and groups
        course_data = grades_data[course_number]
        for semester in course_data.values():  # Iterate through semesters
            for group in semester.values():    # Iterate through groups
                for exam_data in group:        # Iterate through exam instances
                    if 'distribution' in exam_data:
                        # Add this distribution to the total
                        for i in range(10):
                            total_distribution[i] += exam_data['distribution'][i]
        
        # Create the histogram
        plt.figure(figsize=(12, 6))
        plt.bar(grade_ranges, total_distribution, color='skyblue')
        plt.title(f'Grade Distribution for Course {course_number}')
        plt.xlabel('Grade Ranges')
        plt.ylabel('Number of Students')
        plt.xticks(rotation=45)
        
        # Add value labels on top of each bar
        for i, v in enumerate(total_distribution):
            plt.text(i, v, str(v), ha='center', va='bottom')
        
        plt.tight_layout()
        
        # Save the plot
        current_dir = os.path.dirname(os.path.abspath(__file__))
        plots_dir = os.path.join(current_dir, 'grade_plots')
        os.makedirs(plots_dir, exist_ok=True)
        
        plot_path = os.path.join(plots_dir, f'grade_distribution_{course_number}.png')
        plt.savefig(plot_path)
        plt.close()
        
        print(f"Saved grade distribution plot to {plot_path}")
        return total_distribution

    def analyze_course_grades(self, course_number, grades_file=None):
        """
        Analyzes and plots grade distribution for a specific course.
        
        Args:
            course_number: The course number to analyze
            grades_file: Optional path to grades JSON file. If None, downloads fresh data.
        """
        if grades_file and os.path.exists(grades_file):
            with open(grades_file, 'r', encoding='utf-8') as f:
                grades_data = json.load(f)
        else:
            # Download fresh data
            response = requests.get("https://arazim-project.com/data/grades.json")
            response.raise_for_status()
            grades_data = response.json()
        
        return self.plot_course_grade_distribution(grades_data, course_number)

if __name__ == "__main__":
    debug = gradeCourse()
    debug.plot_grade_distribution('courses/JSONs/math.json', '03661101')
    #debug.print_course_average('courses/JSONs/math.json', '03663022')
