from fetch_courses import CourseDownloader
from proc_courses import CourseProcessor
from typing import List
import os


class CourseSearchDB:
    def __init__(self):
        self.downloader = CourseDownloader()
        self.processor = CourseProcessor()
        
    def generate_course_trees(self, years: List[str], faculty: str, departments: List[str], merge: bool = True) -> None:
        """
        Generate and process course data for the specified years, faculty, and departments.
        
        Args:
            years: List of academic years to process (e.g. ['2025'])
            faculty: Faculty name (e.g. 'מדעים מדויקים')
            departments: List of departments to process (e.g. ['פיזיקה', 'מתמטיקה'])
            merge: Whether to merge courses from multiple years
        """
        # Create base directory for JSONs if it doesn't exist
        json_dir = os.path.join(os.path.dirname(__file__))
        if not os.path.exists(json_dir):
            os.makedirs(json_dir)
            
        # Create filename based on merge parameter
        if merge:
            years_range = f"{min(years)}-{max(years)}"
            base_filename = f"{years_range}-{faculty.replace(' ', '_')}"
            if departments:
                base_filename += f"-{'_'.join(dep.replace(' ', '_') for dep in departments)}"
        else:
            base_filename = f"{'-'.join(years)}-{faculty.replace(' ', '_')}"
            if departments:
                base_filename += f"-{'_'.join(dep.replace(' ', '_') for dep in departments)}"
        
        json_path = os.path.join(json_dir, f"{base_filename}.json")
        
        # Download raw courses from Arazim Project
        print("\nStep 1: Downloading courses...")
        self.downloader.fetch_courses(
            years=years,
            faculty=faculty,
            departments=departments,
            merge=merge
        )
        
        # Delete tirgulim entries
        print("\nStep 2: Removing tirgulim...")
        self.processor.delete_tirgulim(json_path)
        
        """
        # Validate and fix course types
        print("\nStep 3: Validating course types...")
        changes = self.processor.validate_course_type(json_path)
        if changes:
            print(f"Updated types for {len(changes)} courses")
        """

        # Complete course data with links, eval types, and requirements
        print("\nStep 4: Completing course data...")
        courses = self.processor.complete_course_data(json_path)
        
        # Split data by department
        print("\nStep 5: Splitting data by department...")
        dept_counts = self.processor.split_by_department(json_path)
        
        # Print final summary
        print("\nProcessing completed!")
        print("Created the following department files:")
        for dept, count in dept_counts.items():
            print(f"- {dept}: {count} courses")


if __name__ == "__main__":
    # Example usage
    course_search_db = CourseSearchDB()
    course_search_db.generate_course_trees(
        years=['2025', '2024', '2023'],
        faculty='מדעים מדויקים',
        departments=['פיזיקה', 'מתמטיקה'],
        merge=True
    )