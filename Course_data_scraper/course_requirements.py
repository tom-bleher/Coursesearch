import re
import time

import requests


def get_course_requirements(url, delay = 1):
    response = requests.get(url)
    requirements = []
    html_txts = response.text.split('קורסים מקבילים נדרשים') # split to pre_req and parallel_req
    for html_content in html_txts:
        pre_req = []
        if response.status_code == 200:  # find pre requirements to course
            time.sleep(delay)

            # Define regex pattern to match the <tr> elements with class "listtdbld"
            pattern = r'<td style=["\']width:75px["\']>(.*?)</td>'
            matches = re.findall(pattern, html_content, re.DOTALL)
            for match in matches:
                pre_course = match.strip()  # Third td (style="width:75px")
                pre_course = re.sub('-', '', pre_course)
                pre_req.append(pre_course)
        requirements.append(pre_req)
    if len(requirements) == 1:
        requirements.append([])
    return requirements[0], requirements[1]
