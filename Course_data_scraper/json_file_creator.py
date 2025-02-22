import re
from bs4 import BeautifulSoup

from get_courses_data import get_courses_data
from course_requirements import get_course_requirements

requirements_handle = r"javascript:open_win\('Drishot_L\.aspx\?kurs=([\w\d]{8})"  # str appears only if there are requi


# courses_dir = "Math_courses"

def clean_str(st):  # cleans unwanted characters from txt
    return st.replace("\xa0", " ")


def create_courses_json(html_files, get_course_requi=False):
    output_data = {}
    for file_name in html_files:
        extracted_data = {}
        with open(file_name, "r", encoding="utf-8") as file:
            # html_content = file.read()
            soup = BeautifulSoup(file, "html.parser")
            matches = re.findall(requirements_handle, str(soup))
            for match in matches:
                extracted_data[match] = True  # to know which courses might have דרישות קדם
            courses_data = get_courses_data(soup)
        dict_creator(courses_data, extracted_data, get_course_requi, output_data)
    return output_data


def dict_creator(courses_data, extracted_data, get_course_requi, output_data):
    for course_data in courses_data:
        course_number, course_group, course_name = r1_extractor(course_data[0])
        faculty, major = course_data[1][1].split('/')
        course_keys = course_data[2]
        course_items = course_data[3]
        if course_number in output_data:
            course = output_data[course_number]
            group_data = fill_group_data(course_items, course_keys)
            group_data["group"] = course_group
            course["specific_data"].append(group_data)
        else:

            if course_number in extracted_data and get_course_requi:
                url = f"https://www.ims.tau.ac.il/tal/kr/Drishot_L.aspx?kurs={course_number}&kv=01&sem=20242"
                pre_req, parallel_req = get_course_requirements(url,
                                                                delay=1)  # delay to not spam the university to much
            else:
                pre_req, parallel_req = [], []
            specific_data = []
            group_data = fill_group_data(course_items, course_keys)
            group_data["group"] = course_group
            specific_data.append(group_data)
            curr_entry = {
                "course_name": course_name,
                "course_number": course_number,
                "course_link": f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}"
                               f"{course_group}&year=2024",
                "parallel_req": parallel_req,
                "pre_req": pre_req,
                "specific_data": specific_data
            }
            output_data[course_number] = curr_entry


def fill_group_data(course_items, course_keys):
    group_data = {}
    for i in range(len(course_keys)):
        group_data[clean_str(course_keys[i])] = clean_str(course_items[i])
    return group_data


def r1_extractor(r1_data):
    course_numbers = ''.join(c for c in r1_data[0] if c.isdigit())
    course_number, course_group = course_numbers[0:8], course_numbers[8:10]
    course_name = r1_data[1]
    return course_number, course_group, course_name

