# Course Dependency Visualization Tool

An interactive web-based tool for visualizing course dependencies and prerequisites in an academic curriculum. This project provides a clear and intuitive graph representation of course relationships, helping students and advisors better understand course progression paths.

## 🌟 Features

- Interactive graph visualization of course dependencies
- Intuitive node-based representation of courses
- Responsive design for desktop and mobile devices
- Dynamic prerequisite path highlighting
  - Forward path: Shows which courses this course enables
  - Backward path: Shows required prerequisites
  - Highlights entire chains of dependencies
- Advanced search and filter capabilities
  - Filter by department, level, or semester
  - Search by course code or keywords
  - Real-time results updating

## 📊 Usage

1. Open `course_graph.html` in your web browser
2. Navigate the visualization:
   - Zoom: Mouse wheel or pinch gesture
   - Pan: Click and drag or two-finger swipe
   - Select: Click on any course node
3. Interaction features:
   - Double-click a course to expand/collapse its dependencies
   - Hover over courses to see detailed information
   - Use the search bar to find specific courses
   - Apply filters using the sidebar controls

## 🛠️ Technical Details

- Built with D3.js for graph visualization
- Implements Force-Directed Graph layout
- JSON-based course data structure
- Responsive SVG rendering

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Course data provided by Tel Aviv University

## 📫 Contact

For questions and support, please open an issue in the GitHub repository or contact the maintainers.