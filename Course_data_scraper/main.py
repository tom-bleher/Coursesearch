import json
from pathlib import Path
from json_file_creator import create_courses_json

n = 97
files_names = []
courses_dir = 'all_faculties'
get_course_requi = True
for i in range(n):
    files_name = f"{courses_dir}/pg{i}.html"
    my_file = Path(files_name)
    if my_file.is_file():
        files_names.append(files_name)

output_data = create_courses_json(files_names,
                                  get_course_requi=get_course_requi)  # getting course requi spams university pages
if get_course_requi:
    with open(f"{courses_dir}\courses.json", "w", encoding="utf-8") as output_file:
        json.dump(output_data, output_file, ensure_ascii=False, indent=4)
else:  # to keep existing requirements
    if Path(f"{courses_dir}\courses.json").is_file():
        with open(f"{courses_dir}\courses.json", "r", encoding="utf-8") as output_file:
            courses_dict = json.load(output_file)
        for course_num in output_data:
            for key in output_data[course_num]:
                if key != 'pre_req' and key != 'parallel_req':
                    courses_dict[course_num][key] = output_data[course_num][key]
        with open(f"{courses_dir}\courses.json", "w", encoding="utf-8") as output_file:
            json.dump(courses_dict, output_file, ensure_ascii=False, indent=4)
