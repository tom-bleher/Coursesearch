import json
from pathlib import Path
from json_file_creator import create_courses_json

n = 3
files_names = []
courses_dir = 'Math_courses'
for i in range(n):
    files_name = f"{courses_dir}/pg{i}.html"
    my_file = Path(files_name)
    if my_file.is_file():
        files_names.append(files_name)

output_data = create_courses_json(files_names, get_course_requi=False)  # getting course requi spams university pages
with open(f"{courses_dir}\courses.json", "w", encoding="utf-8") as output_file:
    json.dump(output_data, output_file, ensure_ascii=False, indent=4)
