import re

from course_requirements import get_course_requirements



def get_course_data(match):
    course_number = match[1].strip()  # First td is the course name
    course_name = match[2].strip()  # Second td is the number
    # Remove any HTML entities like &nbsp; and span tags
    course_number = re.sub(r'-&nbsp;|<.*?>', '', course_number).strip()[0:9]
    course_name = re.sub(r'&nbsp;|<.*?>', '', course_name).strip()
    # Write the cleaned course name and number to the file
    course_number = re.sub('-', '', course_number)
    return course_number, course_name



requirements_handle = r"javascript:open_win\('Drishot_L\.aspx\?kurs=([\w\d]{8})"  # str appears only if there are requi
courses_dir = "Math_courses"
def create_courses_json(html_files, get_course_requi = False):
    output_data = []
    for file_name in html_files:
        extracted_data = {}
        with open(file_name, "r", encoding="utf-8") as file:
            html_content = file.read()
            matches = re.findall(requirements_handle, html_content)
            for match in matches:
                extracted_data[match] = True
        # Define the regular expression to find <tr> elements with class "listtdbld"
        pattern = (r'<tr.*?class=["\'](listtdbld|listtd)["\'].*?>.*?(?:<td.*?>(.*?)</td>.*?<td colspan=["\'].*?["\']>('
                   r'.*?)</td>|<td[^>]*colspan=["\']7["\'][^>]*>(.*?)</td>).*?</tr>')
        # Find all matches
        matches = re.findall(pattern, html_content, re.DOTALL)

        # Open a file to write the results
        last = "a"
        curr_entry = False
        for match in matches:
            if match[0] == 'listtdbld':
                course_number, course_name = get_course_data(match)

                if last != course_number:
                    if course_number in extracted_data and get_course_requi:
                        url = f"https://www.ims.tau.ac.il/tal/kr/Drishot_L.aspx?kurs={course_number}&kv=01&sem=20242"
                        pre_req, parallel_req = get_course_requirements(url,
                                                                        delay=1)  # delay to not spam the university to much
                    else:
                        pre_req, parallel_req = [], []
                    curr_entry = {
                        "course_name": course_name,
                        "course_number": course_number,
                        "course_link": f"https://www.ims.tau.ac.il/Tal/Syllabus/Syllabus_L.aspx?course={course_number}01&year=2024",
                        "parallel_req": parallel_req,
                        "pre_req": pre_req,
                    }
            elif match[0] == 'listtd' and curr_entry:  # If it's listtd, and we have a pending listtdbld
                course_of_study = match[2].strip()  # Extract the <td> with colspan="7" (course number)
                faculty, degree = course_of_study.split('/')
                curr_entry["faculty"] = faculty
                curr_entry["degree"] = degree
                output_data.append(curr_entry)
                curr_entry = []

            last = course_number
    return output_data
