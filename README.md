# Coursesearch

An interactive map of courses, prerequisites, study programs and grades for Mathematics, Physics and Computer Science at Tel Aviv University.

**[Open the site →](https://tom-bleher.github.io/Coursesearch/)**

## Features

- **Prerequisite graph.** Courses are grouped by study year. Edges show required courses, alternatives ("one of") and co-requisites. Click a course to highlight its whole prerequisite chain and the courses it unlocks.
- **Study programs.** Pick any undergraduate program in the Exact Sciences, or any other program involving math, physics or CS (49 in total). Its courses are laid out by year and semester, straight from the official catalog (ידיעון): credit requirements, official notes and rules for each part, the degree's credit quota, and links to the catalog and regulations. Click a year or semester band to see its rules.
- **Grades.** Node colour shows the average final grade (מועד קובע) over the last five years. The course card has the distribution and a per-semester breakdown.
- **Planning.** Mark the courses you've passed. The site then shows:
  - what you can take in any upcoming semester, and which courses are one prerequisite away and what's missing;
  - a semester-by-semester plan: planned courses count as done for later semesters, and you get warnings for missing prerequisites, unplanned co-requisites, or courses not offered that semester;
  - progress toward each category of your study program (a course listed in several categories counts toward one).

  AND/OR prerequisite logic is taken into account. Prerequisites from other faculties can be marked as passed in the course card. Everything is saved in the browser.
- **Details.** Each course card lists lecturers, exam type, credit hours and the semesters it's offered, with links to the syllabus and to the official prerequisites page.
- Search by name or course number, shareable links (`#course=03661102`), dark mode and a mobile layout.

## Data

`scripts/update_data.py` builds `data/courses.json` using only the Python standard library. It draws on two sources:

- **[Arazim Project](https://arazim-project.com) dumps:** semester schedules and prerequisites, the all-time course index, study plans (for joint programs, and credit points for courses outside the catalog programs) and TAU Factor grade distributions ([format](https://github.com/arazimproject/tau-search/blob/main/src/types.ts)).
- **[TAU program catalog](https://www.tau.ac.il/search-studies-programs):** program structure, credit requirements, official notes and course credit points. The data comes from the GraphQL API behind the catalog pages. To cover every faculty, set `CATALOG_FACULTIES = {""}`.

```sh
python3 scripts/update_data.py   # fetch the latest data and rebuild data/courses.json
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

Each user gets one document, `users/{uid}`, holding only their passed courses, planned courses, chosen program and a timestamp. Users can delete it from the account menu.

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
