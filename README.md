# Coursesearch

An interactive map of courses, prerequisites, study programs and grades for all of Tel Aviv University.

**[Open the site →](https://tom-bleher.github.io/Coursesearch/)**

## Features

- **Prerequisite graph.** Courses are grouped by study year. Edges show required courses, alternatives ("one of") and co-requisites. Click a course to highlight its whole prerequisite chain and the courses it unlocks.
- **Study programs.** Pick any program in the official catalog, from every faculty and degree (bachelor's, master's and more), or a joint program. Its courses are laid out by year and semester, straight from the official catalog (ידיעון): credit requirements, official notes and rules for each part, the degree's credit quota, and links to the catalog and regulations. Click a year or semester band to see its rules.
- **Grades.** A coloured strip on each course shows the average final grade (מועד קובע) over the years for which TAU Factor has grades. The course card has the distribution and a per-semester breakdown.
- **My degree.** Pick a faculty and a program (and the catalog year you started in) to get your degree as a checklist, organized like the official catalog: years, their required and elective parts, and each part's courses.
  - Mark courses as passed (a whole mandatory semester at once), add your grade, or plan a course for a semester. Requirements without a course list, such as "שאר רוח", take credits entered by hand.
  - Progress is shown for the whole degree, each year and each part, in credit points (a course listed in several parts counts toward one), with your credit-weighted average.
  - Each course shows what it still needs; the semesters view lays out your plan term by term and warns about missing prerequisites, unplanned co-requisites and courses not offered that semester. Planned courses count as done for later semesters.
  - AND/OR prerequisite logic is taken into account. Prerequisites from other faculties can be marked as passed in the course card. Everything is saved in the browser.
- **Map.** The same program, or any academic unit's courses, as a prerequisite graph; passed and planned courses are marked on it. A program's map shows its required courses, plus electives on demand. Arrow keys move between courses.
- **Details.** Each course card lists lecturers, exam type, credit hours and the semesters it's offered, with links to the syllabus and to the official prerequisites page.
- Search by name or course number, shareable links (`#course=03661102`), dark mode and a mobile layout.

## Data

`scripts/update_data.py` builds the data for the whole university using only the Python standard library. It draws on two sources:

- **[Arazim Project](https://arazim-project.com) dumps:** semester schedules and prerequisites, the all-time course index, study plans (for joint programs, and credit points for courses outside the catalog programs) and TAU Factor grade distributions ([format](https://github.com/arazimproject/tau-search/blob/main/src/types.ts)).
- **[TAU program catalog](https://www.tau.ac.il/search-studies-programs):** program structure, credit requirements, official notes and course credit points. The data comes from the GraphQL API behind the catalog pages.

The output is split so the site loads only what it shows: `data/index.json` (every course's name, unit, prerequisites, semesters, credits and average grade, and the list of programs), `data/courses/{unit}.json` (lecturers, exams, grade distributions and syllabus links, by the course number's first four digits) and `data/programs/{id}.json` (one program each).

```sh
python3 scripts/update_data.py   # fetch the latest data and rebuild data/ (about 10 minutes)
python3 -m http.server           # then open http://localhost:8000
```

A GitHub Actions workflow refreshes the data every week and deploys the site to GitHub Pages.

Grade statistics use each semester's all-groups final-grade distribution, weighted by the number of students. Non-numeric grades are excluded. Always confirm requirements on the [university website](https://www.ims.tau.ac.il/Tal/).

## Google sign-in (optional)

Progress is always saved in the browser. To also let students sign in with Google and sync their progress across devices, set up a Firebase project. The free tier is enough.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) and add a **Web app**.
2. **Authentication → Sign-in method:** enable **Google**. Under **Settings → Authorized domains**, add `tom-bleher.github.io`.
3. **Firestore Database:** create a database, then deploy the access rules with `npx firebase-tools deploy --only firestore:rules --project <project-id>`.
4. Paste the web app's config object into `assets/firebase-config.js` (`window.FIREBASE_CONFIG = {...}`). The web config is public by design; access is enforced by the rules.

Each user gets one document, `users/{uid}`, holding only their passed courses, grades, planned courses, credits entered by hand, chosen program and a timestamp. Users can delete it from the account menu. After changing `firestore.rules`, deploy them again (step 3).

## Tests

```sh
pip install pytest playwright && playwright install chromium-headless-shell
python3 -m pytest tests
```

## Contact

Questions and suggestions are welcome as GitHub issues, or contact:
- Tom Bleher: [tombleher@tauex.tau.ac.il](mailto:tombleher@tauex.tau.ac.il)
- Ilay Wischnevsky Shlush: [ilayw1@mail.tau.ac.il](mailto:ilayw1@mail.tau.ac.il)
- Avshalom Bar-Nissan: [barnissan@mail.tau.ac.il](mailto:barnissan@mail.tau.ac.il)

## Acknowledgements

Course, study-plan and grade data: [Arazim Project](https://arazim-project.com/) and [TAU Factor](https://www.tau-factor.com/).

## License

MIT. See [LICENSE](LICENSE).
