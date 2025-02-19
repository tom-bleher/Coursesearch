import re
import time
import json
import requests
courses_dir = "Math_courses"
n = 3
output_data = []


def get_pre_req(url, delay = 1):
    pre_req = []
    response = requests.get(url)
    pre_req_found = False
    if response.status_code == 200:  # find pre req to course
        time.sleep(delay)
        pre_req_found = True
        html_content = response.text  # Read the HTML content directly

        # Define regex pattern to match the <tr> elements with class "listtdbld"
        pattern = r'<td style=["\']width:75px["\']>(.*?)</td>'
        matches = re.findall(pattern, html_content, re.DOTALL)
        for match in matches:
            pre_course = match.strip()  # Third td (style="width:75px")
            pre_course = re.sub('-', '', pre_course)
            pre_req.append(pre_course)
    return pre_req, pre_req_found


def get_course_data(match):
    course_number = match[1].strip()  # First td is the course name
    course_name = match[2].strip()  # Second td is the number
    # Remove any HTML entities like &nbsp; and span tags
    course_number = re.sub(r'-&nbsp;|<.*?>', '', course_number).strip()[0:9]
    course_name = re.sub(r'&nbsp;|<.*?>', '', course_name).strip()
    # Write the cleaned course name and number to the file
    course_number = re.sub('-', '', course_number)
    return course_number, course_name

for i in range(n):

    with open(f"{courses_dir}/pg{i}.html", "r", encoding="utf-8") as file:
        html_content = file.read()

    # Define the regular expression to find <tr> elements with class "listtdbld"
    pattern = r'<tr.*?class=["\'](listtdbld|listtd)["\'].*?>.*?(?:<td.*?>(.*?)</td>.*?<td colspan=["\'].*?["\']>(.*?)</td>|<td[^>]*colspan=["\']7["\'][^>]*>(.*?)</td>).*?</tr>'
    # Find all matches
    matches = re.findall(pattern, html_content, re.DOTALL)

    # Open a file to write the results
    last = "a"
    curr_entry = False
    for match in matches:
        if match[0] == 'listtdbld':
            course_number, course_name = get_course_data(match)

            if last != course_number:
                url = f"https://www.ims.tau.ac.il/tal/kr/Drishot_L.aspx?kurs={course_number}&kv=01&sem=20242"
                pre_req, pre_req_found = get_pre_req(url, delay=1)# delay to not spam the univrsity to much
                curr_entry = {
                    "course_name": course_name,
                    "course_number": course_number,
                    "course_link" : f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}01&year=2024",
                    "pre_req_found": pre_req_found,
                    "pre_req": pre_req,
                }
        elif match[0] == 'listtd' and curr_entry:  # If it's listtd, and we have a pending listtdbld
            course_of_study = match[2].strip()  # Extract the <td> with colspan="7" (course number)
            faculty, degree = course_of_study.split('/')
            curr_entry["faculty"] = faculty
            curr_entry["degree"] = degree
            output_data.append(curr_entry)

        last = course_number
with open(f"{courses_dir}\courses.json", "w", encoding="utf-8") as output_file:
    json.dump(output_data, output_file, ensure_ascii=False, indent=4)
