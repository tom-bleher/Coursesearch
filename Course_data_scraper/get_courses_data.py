def get_html_txt(row, html_obj):
    objs = row.find_all(html_obj)
    obj_texts = [obj.get_text(strip=True) for obj in objs]
    return obj_texts


def get_courses_data(soup):
    rows = soup.find_all("tr")
    courses_data = []
    i = 0
    while i < len(rows):
        row = rows[i]

        # Check if the current <tr> has class 'listtdbld'
        if "listtdbld" in row.get("class", []):
            # Take this row and the next 3 rows
            course_data = []
            # extracting text from html <tr>
            course_data.append(get_html_txt(row, "td"))
            course_data.append(get_html_txt(rows[i + 1], "td"))
            course_data.append(get_html_txt(rows[i + 2], "th"))  # this <tr> has text in form of <th>
            course_data.append(get_html_txt(rows[i + 3], "td"))

            courses_data.append(course_data)
            i += 4  # Move to the next potential "listtdbld"
        else:
            i += 1  # Continue scanning
    return courses_data
