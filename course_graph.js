// Course data and state variables
let courses_math = [];
let courses_physics = [];
let currentCourses = [];
let elements = {
    nodes: [],
    edges: []
};
let initialLayout = null;
let initialNodePositions = null;
let showSeminars = false;
let showGuidedReading = false;
let showProjects = false;
let showIsolatedCourses = false;
let showPastYears = false;

// Type mapping (English to Hebrew)
const typeMapping = {
    'Seminar': 'סמינר',
    'Guided Reading': 'קריאה מודרכת',
    'Project': 'פרוייקט',
    'Lecture': 'שיעור',
    'Lecture and Exercise': 'שיעור ותרגיל',
    'Laboratory': 'מעבדה',
    'Final Project': 'פרוייקט גמר',
    'Department Final Project': 'פרוייקט גמר מחלקתי',
    'Colloquium': 'קולוקוויום'
};

// Evaluation type mapping (English to Hebrew)
const evalTypeMapping = {
    'Final Exam': 'בחינה סופית',
    'Paper': 'עבודת בית',
    'Project': 'פרוייקט',
    'Other': 'אחר',
    'Take-home exam': 'בחינת בית',
    'Attendance': 'נוכחות',
    'Class Participation': 'השתתפות בכיתה'
};

// Function to normalize type (convert English to Hebrew)
function normalizeType(type) {
    if (!type) return null;
    
    // Log the type before normalization
    console.log('Original type:', type);
    
    // If the type is already in Hebrew, return it as is
    if (/[\u0590-\u05FF]/.test(type)) {
        console.log('Type is already in Hebrew:', type);
        return type;
    }
    
    const normalized = typeMapping[type] || type;
    console.log('Normalized type:', normalized);
    return normalized;
}

// Function to normalize evaluation type (convert English to Hebrew)
function normalizeEvalType(evalType) {
    if (!evalType) return null;
    
    // If the evalType is already in Hebrew, return it as is
    if (/[\u0590-\u05FF]/.test(evalType)) {
        return evalType;
    }
    
    return evalTypeMapping[evalType] || evalType;
}

// Filter state variables
let activeFilters = {
    faculty: new Set(['מדעים מדויקים/מתמטיקה']),
    year: new Set(['2025']),
    type: new Set(['שיעור']),
    eval: new Set(['all'])
};

// Function to extract year from last_offered
function extractYear(lastOffered) {
    if (!lastOffered) return null;
    // Extract just the year from the format "2025a" or "2025b"
    const year = lastOffered.slice(0, 4);
    return year;
}

// Function to populate filter options
function populateFilterOptions() {
    const faculties = new Set(['מדעים מדויקים/מתמטיקה', 'מדעים מדויקים/פיזיקה']);
    const years = new Set();
    const types = new Set();
    const evals = new Set();

    // Get courses based on selected faculty
    const selectedFaculties = Array.from(activeFilters.faculty);
    const relevantCourses = [...courses_math, ...courses_physics].filter(course => {
        return selectedFaculties.includes('all') || selectedFaculties.includes(course.faculty);
    });

    // Log available course types
    console.log('Available courses:', relevantCourses.map(c => ({ name: c.id, type: c.type })));

    // Collect unique values from relevant courses only
    relevantCourses.forEach(course => {
        if (course.type) {
            const normalizedType = normalizeType(course.type);
            types.add(normalizedType);
        }
        if (course.last_offered) {
            const year = extractYear(course.last_offered);
            if (year) years.add(year);
        }
        if (Array.isArray(course.eval_type)) {
            course.eval_type.forEach(eval => {
                evals.add(normalizeEvalType(eval));
            });
        } else if (course.eval_type) {
            evals.add(normalizeEvalType(course.eval_type));
        }
    });

    // Log collected types
    console.log('Collected types:', Array.from(types));

    // Helper function to count occurrences
    function countOccurrences(selectId, courses) {
        const counts = new Map();
        
        courses.forEach(course => {
            let value;
            switch(selectId) {
                case 'facultyFilter':
                    value = course.faculty;
                    if (value) counts.set(value, (counts.get(value) || 0) + 1);
                    break;
                case 'yearFilter':
                    value = extractYear(course.last_offered);
                    if (value) counts.set(value, (counts.get(value) || 0) + 1);
                    break;
                case 'typeFilter':
                    value = course.type;
                    if (value) counts.set(value, (counts.get(value) || 0) + 1);
                    break;
                case 'evalFilter':
                    if (Array.isArray(course.eval_type)) {
                        course.eval_type.forEach(eval => {
                            if (eval) counts.set(eval, (counts.get(eval) || 0) + 1);
                        });
                    } else if (course.eval_type) {
                        counts.set(course.eval_type, (counts.get(course.eval_type) || 0) + 1);
                    }
                    break;
            }
        });
        return counts;
    }

    // Helper function to populate select elements
    function populateSelect(selectId, options, activeSet) {
        const select = document.getElementById(selectId);
        select.innerHTML = '';
        
        // Add "all" option
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = selectId === 'yearFilter' ? 'כל השנים' : 'הכל';
        allOption.selected = activeSet.has('all');
        select.appendChild(allOption);

        // Get occurrence counts for sorting - use all relevant courses based on faculty filter
        const selectedFaculties = Array.from(activeFilters.faculty);
        const relevantCourses = [...courses_math, ...courses_physics].filter(course => {
            return selectedFaculties.includes('all') || selectedFaculties.includes(course.faculty);
        });
        const counts = countOccurrences(selectId, relevantCourses);
        
        // Convert options to array and sort by frequency
        let sortedOptions = Array.from(options).sort((a, b) => {
            if (selectId === 'yearFilter') {
                // For years, keep chronological order
                return parseInt(b) - parseInt(a);
            }
            // Sort by count (descending) and then alphabetically if counts are equal
            const countA = counts.get(a) || 0;
            const countB = counts.get(b) || 0;
            if (countB !== countA) {
                return countB - countA;
            }
            return a.localeCompare(b);
        });

        sortedOptions.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option;
            
            // Add count to option text except for faculty filter
            const count = counts.get(option) || 0;
            if (selectId === 'facultyFilter') {
                optElement.textContent = option.split('/')[1] || option;
            } else {
                optElement.textContent = `${option} (${count})`;
            }
            
            optElement.selected = activeSet.has(option);
            
            // Disable year options that aren't 2025 or "all"
            if (selectId === 'yearFilter' && option !== '2025') {
                optElement.disabled = true;
                optElement.style.color = '#999999';
            }
            
            select.appendChild(optElement);
        });

        // Ensure the correct options are selected based on activeFilters
        if (!activeSet.has('all')) {
            allOption.selected = false;
            Array.from(select.options).forEach(opt => {
                opt.selected = activeSet.has(opt.value);
            });
        }
    }

    // Populate all select elements with current active filters
    populateSelect('facultyFilter', faculties, activeFilters.faculty);
    populateSelect('yearFilter', years, activeFilters.year);
    populateSelect('typeFilter', types, activeFilters.type);
    populateSelect('evalFilter', evals, activeFilters.eval);
}

// Function to apply filters
function applyFilters() {
    // Get all courses
    const allCourses = [...courses_math, ...courses_physics];
    
    const filteredCourses = allCourses.filter(course => {
        // Check faculty filter
        if (!activeFilters.faculty.has('all')) {
            if (!course.faculty || !activeFilters.faculty.has(course.faculty)) {
                return false;
            }
        }

        // Check year filter
        if (!activeFilters.year.has('all')) {
            const courseYear = extractYear(course.last_offered);
            if (!courseYear || !activeFilters.year.has(courseYear)) {
                return false;
            }
        }

        // Check type filter
        if (!activeFilters.type.has('all')) {
            if (!course.type || !activeFilters.type.has(course.type)) {
                return false;
            }
        }

        // Check eval filter
        if (!activeFilters.eval.has('all')) {
            if (!course.eval_type) return false;
            if (Array.isArray(course.eval_type)) {
                if (!course.eval_type.some(eval => {
                    const normalizedEval = normalizeEvalType(eval);
                    return activeFilters.eval.has(normalizedEval);
                })) {
                    return false;
                }
            } else {
                const normalizedEval = normalizeEvalType(course.eval_type);
                if (!activeFilters.eval.has(normalizedEval)) {
                    return false;
                }
            }
        }

        return true;
    });

    // Update current courses
    currentCourses = filteredCourses;
    
    // Always hide isolated courses
    showIsolatedCourses = false;
    
    // Update the graph with filtered courses
    updateGraph();
}

// Event listeners for filter controls
document.addEventListener('DOMContentLoaded', () => {
    // Handle filter changes
    ['facultyFilter', 'yearFilter', 'typeFilter', 'evalFilter'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener('change', (e) => {
                const filterType = id.replace('Filter', '');
                const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
                
                // Handle selection logic
                if (selectedOptions.length === 0) {
                    // If nothing is selected, default to 'all'
                    activeFilters[filterType] = new Set(['all']);
                    e.target.querySelector('option[value="all"]').selected = true;
                } else if (selectedOptions.includes('all')) {
                    // If 'all' is selected, unselect everything else
                    activeFilters[filterType] = new Set(['all']);
                    Array.from(e.target.options).forEach(option => {
                        option.selected = option.value === 'all';
                    });
                } else {
                    // Normal multi-select behavior
                    activeFilters[filterType] = new Set(selectedOptions);
                    if (e.target.querySelector('option[value="all"]')) {
                        e.target.querySelector('option[value="all"]').selected = false;
                    }
                }

                // If faculty filter changes, update other filters
                if (id === 'facultyFilter') {
                    // Reset type and eval filters to 'all'
                    activeFilters.type = new Set(['all']);
                    activeFilters.eval = new Set(['all']);
                    // Repopulate options based on new faculty selection
                    populateFilterOptions();
                }
            });
        }
    });

    // Handle apply filters button
    const applyButton = document.getElementById('applyFilters');
    if (applyButton) {
        applyButton.addEventListener('click', applyFilters);
    }

    // Handle universal reset button
    const resetButton = document.getElementById('resetAll');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            setInitialFilters();
            if (searchInput) {
                searchInput.value = '';
            }
            resetView();
        });
    }
});

// Load and transform course data from JSON files
async function loadCourseData() {
    try {
        // Load both math and physics data
        const [mathResponse, physicsResponse] = await Promise.all([
            fetch('courses/JSONs/math.json'),
            fetch('courses/JSONs/physics.json')
        ]);

        const mathData = await mathResponse.json();
        const physicsData = await physicsResponse.json();

        // Store the raw JSON data
        courses_math = mathData;
        courses_physics = physicsData;

        console.log('Course data loaded successfully');
        console.log('Math courses:', Object.keys(courses_math).length);
        console.log('Physics courses:', Object.keys(courses_physics).length);

        // Process math courses
        courses_math = Object.entries(mathData).map(([courseNumber, courseInfo]) => {
            // Process prerequisites
            const prereqs = courseInfo.preq || [];
            const processedPrereqs = prereqs.filter(p => p !== 'וגם' && p !== 'או')
                .map(preReqNum => {
                    const preReqCourse = mathData[preReqNum] || physicsData[preReqNum];
                    return preReqCourse ? preReqCourse.name : null;
                })
                .filter(name => name !== null);

            // Process corequisites
            const coreqs = courseInfo.pareq || [];
            const processedCoreqs = coreqs.filter(p => p !== 'וגם' && p !== 'או')
                .map(coReqNum => {
                    const coReqCourse = mathData[coReqNum] || physicsData[coReqNum];
                    return coReqCourse ? coReqCourse.name : null;
                })
                .filter(name => name !== null);

            // Preserve the original type and normalize it
            const originalType = courseInfo.type;
            const normalizedType = normalizeType(originalType);
            
            return {
                id: courseInfo.name,
                name: courseInfo.name,
                course_link: courseInfo.course_link,
                faculty: 'מדעים מדויקים/מתמטיקה',
                original_type: originalType,
                type: normalizedType,
                eval_type: Array.isArray(courseInfo.eval_type) ?
                    courseInfo.eval_type.map(normalizeEvalType) :
                    normalizeEvalType(courseInfo.eval_type),
                prereqs: processedPrereqs,
                coreqs: processedCoreqs,
                last_offered: courseInfo.last_offered,
                avg_grade: courseInfo.avg_grade,
                grade_distribution: courseInfo.grade_distribution,
                total_students: courseInfo.total_students
            };
        });

        // Process physics courses with the same structure
        courses_physics = Object.entries(physicsData)
            .map(([courseNumber, courseInfo]) => {
                // Process prerequisites
                const prereqs = courseInfo.preq || [];
                const processedPrereqs = prereqs.filter(p => p !== 'וגם' && p !== 'או')
                    .map(preReqNum => {
                        const preReqCourse = mathData[preReqNum] || physicsData[preReqNum];
                        return preReqCourse ? preReqCourse.name : null;
                    })
                    .filter(name => name !== null);

                // Process corequisites
                const coreqs = courseInfo.pareq || [];
                const processedCoreqs = coreqs.filter(p => p !== 'וגם' && p !== 'או')
                    .map(coReqNum => {
                        const coReqCourse = mathData[coReqNum] || physicsData[coReqNum];
                        return coReqCourse ? coReqCourse.name : null;
                    })
                    .filter(name => name !== null);

                return {
                    id: courseInfo.name,
                    name: courseInfo.name,
                    course_link: courseInfo.course_link,
                    faculty: 'מדעים מדויקים/פיזיקה',
                    original_type: courseInfo.type,
                    type: normalizeType(courseInfo.type),
                    eval_type: Array.isArray(courseInfo.eval_type) ?
                        courseInfo.eval_type.map(normalizeEvalType) :
                        normalizeEvalType(courseInfo.eval_type),
                    prereqs: processedPrereqs,
                    coreqs: processedCoreqs,
                    last_offered: courseInfo.last_offered,
                    avg_grade: courseInfo.avg_grade,
                    grade_distribution: courseInfo.grade_distribution,
                    total_students: courseInfo.total_students
                };
            });

        // Set initial courses to all courses
        currentCourses = [...courses_math, ...courses_physics];
        
        return currentCourses;
    } catch (error) {
        console.error('Error loading course data:', error);
        return [];
    }
}

// Initialize course data
async function initializeCourseData() {
    await loadCourseData();
    // Set initial filters before updating graph
    currentCourses = [...courses_math, ...courses_physics].filter(course => {
        return course.faculty === 'מדעים מדויקים/מתמטיקה' &&
               extractYear(course.last_offered) === '2025' &&
               course.type === 'שיעור';
    });
    updateGraph();
}

// Initialize course data and instructions when the page loads
window.addEventListener('load', () => {
    initializeCourseData().then(() => {
        createInstructionsPanel();
        setInitialFilters();
    });
});

// Initialize Cytoscape with optimized settings
const cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements,
    style: [
        {
            selector: 'node',
            style: {
                'label': 'data(label)',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': '#F5F5F5',
                'text-wrap': 'wrap',
                'text-max-width': '80px',
                'font-size': '14px',
                'font-weight': 'bold',
                'width': '82px',
                'height': '28px',
                'padding': '3px',
                'shape': 'roundrectangle',
                'border-width': '1.5px',
                'border-color': '#78909C',
                'border-opacity': 1,
                'transition-property': 'background-color, opacity, border-color, color',
                'transition-duration': '0.2s',
                'text-margin-y': 0,
                'border-radius': '3px',
                'color': '#455A64',
                'grabifiable': false,  // Disable grab cursor
                'grabbable': false     // Disable dragging
            }
        },
        {
            selector: 'edge[type="prereq"]',
            style: {
                'width': 2.5,
                'line-color': '#000000',
                'target-arrow-color': '#000000',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'control-point-step-size': 40,
                'opacity': 0.9,
                'arrow-scale': 1.2
            }
        },
        {
            selector: 'edge[type="coreq"]',
            style: {
                'width': 2,
                'line-color': '#000000',
                'target-arrow-color': '#000000',
                'target-arrow-shape': 'triangle',
                'line-style': 'dashed',
                'curve-style': 'bezier',
                'control-point-step-size': 40,
                'opacity': 0.7,
                'arrow-scale': 1.2
            }
        }
    ],
    layout: {
        name: 'dagre',
        rankDir: 'TB',
        padding: 50,
        spacingFactor: 1.6,
        animate: false,
        rankSep: 80,
        nodeSep: 60,
        ranker: 'network-simplex',
        edgeSep: 30
    },
    minZoom: 0.5,
    maxZoom: 2.5,
    wheelSensitivity: 0.2,
    pixelRatio: 'auto',
    textureOnViewport: false,
    hideEdgesOnViewport: false,
    motionBlur: false,
    antialias: true,
    maxAnimationTime: 500,
    renderOptimizationThreshold: 2000
});

// Simplified search functionality with debouncing
const searchInput = document.getElementById('search');
let searchTimeout = null;
const searchDelay = 200;

function performSearch(searchTerm) {
    if (!searchTerm) {
        // End any existing batch before reset
        cy.endBatch();
        // Perform full reset
        resetView();
        return;
    }

    cy.startBatch();
    searchTerm = searchTerm.toLowerCase().trim();
    
    // Find matching nodes - improved matching logic
    const matches = cy.nodes().filter(node => {
        const nodeLabel = node.data('label').toLowerCase();
        return nodeLabel.includes(searchTerm);
    });

    if (matches.length === 0) {
        // If no matches, hide everything
        cy.elements().addClass('hidden');
        cy.endBatch();
        return;
    }

    // Get connected edges and neighbors
    const connectedEdges = matches.connectedEdges();
    const neighbors = matches.neighborhood().nodes().difference(matches); // Exclude matches from neighbors
    
    // First, hide all elements
    cy.elements().addClass('hidden');
    
    // Show and highlight matches with darker border only
    matches.removeClass('hidden').style({
        'border-width': '2.5px',
        'border-color': '#000000',
        'color': '#000000',
        'opacity': 1
    });

    // Show and highlight neighbors with thinner border
    neighbors.removeClass('hidden').style({
        'border-width': '2px',
        'border-color': '#000000',
        'color': '#000000',
        'opacity': 1
    });

    // Show edges in black
    connectedEdges.removeClass('hidden').style({
        'line-color': '#000000',
        'target-arrow-color': '#000000',
        'opacity': 1
    });

    // Create a collection of all visible elements
    const visibleElements = matches.union(connectedEdges).union(neighbors);
    
    // Calculate optimal layout parameters based on visible elements
    const nodeCount = visibleElements.nodes().length;
    const branchingFactor = Math.max(...visibleElements.nodes().map(node => 
        Math.max(node.outgoers('node').length, node.incomers('node').length)
    ));
    
    // Adjust spacing based on the number of nodes and branching factor
    const baseSpacing = Math.min(
        Math.max(30, cy.width() / (nodeCount * (1 + branchingFactor * 0.3))),
        60
    );
    
    const horizontalSpacing = baseSpacing * (1 / Math.sqrt(branchingFactor));
    const verticalSpacing = baseSpacing * 1.5;
    
    // Apply layout to visible elements
    const layout = visibleElements.layout({
        name: 'dagre',
        rankDir: 'TB', // Top to Bottom direction
        padding: 30,
        spacingFactor: 1.4,
        animate: true,
        animationDuration: 300,
        rankSep: verticalSpacing,
        nodeSep: horizontalSpacing,
        ranker: 'tight-tree',
        edgeSep: horizontalSpacing * 0.3,
        align: 'UL',
        // Assign ranks based on depth (not inverted anymore)
        rankAssignment: (node) => {
            return depths.get(node.id()) || 0;
        }
    });
    
    // Run the layout
    layout.run();
    
    // Center and fit the view on visible elements with padding after layout completes
    setTimeout(() => {
        cy.fit(visibleElements, 50);
        updateTextScaling();
    }, 350);
    
    cy.endBatch();
}

// Optimized search event listener with proper debouncing
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        const searchTerm = e.target.value.trim();
        searchTimeout = setTimeout(() => {
            performSearch(searchTerm);
        }, searchDelay);
    });
}

// Update the constants for text scaling
const baseFontSize = 14;
const baseNodeWidth = 82;
const baseNodeHeight = 28;

// Efficient text scaling function
const updateTextScaling = _.throttle(() => {
    const zoom = cy.zoom();
    const fontSize = Math.max(Math.min(baseFontSize / zoom, baseFontSize * 1.5), baseFontSize * 0.7);
    const nodeWidth = Math.max(baseNodeWidth / zoom, baseNodeWidth * 0.7);
    const nodeHeight = Math.max(baseNodeHeight / zoom, baseNodeHeight * 0.7);
    const textMaxWidth = Math.max(80 / zoom, 70);

    cy.batch(() => {
        cy.nodes().style({
            'font-size': `${fontSize}px`,
            'text-max-width': `${textMaxWidth}px`,
            'width': `${nodeWidth}px`,
            'height': `${nodeHeight}px`
        });
    });
}, 100);

// Add zoom handler
cy.on('zoom', updateTextScaling);

// Add these variables before the handleNodeClick function
let lastClickedNode = null;
let clickTimeout = null;
let currentlySelectedNode = null;  // Add this to track the currently selected node
const doubleClickDelay = 300; // milliseconds

// Function to get minimal prerequisite path
function getMinimalPrerequisitePath(courseId, courses) {
    const criticalPath = new Set();
    const visited = new Set();
    
    function findCriticalPath(currentId, depth = 0) {
        if (visited.has(currentId)) return;
        visited.add(currentId);
        
        const course = courses.find(c => c.id === currentId);
        if (!course) return;
        
        criticalPath.add(currentId);
        
        // Process prerequisites
        if (course.prereqs) {
            // Sort prerequisites by complexity to prioritize more complex paths
            const prereqsWithComplexity = course.prereqs.map(prereq => {
                const prereqCourse = courses.find(c => c.id === prereq);
                const complexity = prereqCourse ? 
                    (prereqCourse.prereqs?.length || 0) + (prereqCourse.coreqs?.length || 0) : 
                    0;
                return { prereq, complexity };
            });
            
            // Sort by complexity descending
            prereqsWithComplexity.sort((a, b) => b.complexity - a.complexity);
            
            // Take only the most complex prerequisite path unless at top level
            const prereqsToProcess = depth === 0 ? 
                prereqsWithComplexity : 
                [prereqsWithComplexity[0]].filter(Boolean);
            
            prereqsToProcess.forEach(({ prereq }) => {
                findCriticalPath(prereq, depth + 1);
            });
        }
        
        // Process essential corequisites (only if they are also prerequisites for other courses)
        if (course.coreqs) {
            course.coreqs.forEach(coreq => {
                const coreqCourse = courses.find(c => c.id === coreq);
                if (coreqCourse && coreqCourse.prereqs?.some(p => criticalPath.has(p))) {
                    findCriticalPath(coreq, depth);
                }
            });
        }
    }
    
    findCriticalPath(courseId);
    return criticalPath;
}

function handleNodeClick(event) {
    const clickedNode = event.target;
    
    // If clicking background, reset view
    if (event.target === cy) {
        resetView();
        lastClickedNode = null;
        currentlySelectedNode = null;
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }
        return;
    }
    
    if (!clickedNode.isNode()) return;
    
    // Set up for potential double click
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        
        // This is a double click - open the course link
        const courseId = clickedNode.id();
        const course = currentCourses.find(c => c.id === courseId);
        
        if (course && course.course_link) {
            window.open(course.course_link, '_blank');
        }
        
        clickTimeout = null;
        lastClickedNode = null;
        return;
    }
    
    // Set up new click timeout
    lastClickedNode = clickedNode;
    clickTimeout = setTimeout(() => {
        // This is a single click
        
        // Check if clicking the currently selected node
        if (currentlySelectedNode === clickedNode) {
            resetView();
            currentlySelectedNode = null;
            lastClickedNode = null;
            clickTimeout = null;
            return;
        }
        
        // Single click behavior for non-highlighted node
        const courseId = clickedNode.id();
        const courses = currentCourses;
        
        cy.startBatch();
        
        // First, hide all elements
        cy.elements().addClass('hidden');
        
        // Get minimal prerequisite path
        const criticalPath = getMinimalPrerequisitePath(courseId, courses);
        
        // Calculate complexity and depths for the critical path
        const { complexity, depths } = calculateCourseComplexity(
            courses.filter(c => criticalPath.has(c.id))
        );
        
        // Find the maximum depth in the visible elements
        let maxDepth = 0;
        criticalPath.forEach(prereqId => {
            const depth = depths.get(prereqId) || 0;
            maxDepth = Math.max(maxDepth, depth);
        });
        
        // Create a collection of visible elements
        const visibleElements = cy.collection();
        visibleElements.merge(clickedNode);
        
        // Show and highlight the target course
        clickedNode.removeClass('hidden').style({
            'border-width': '3px',
            'border-color': '#000000',
            'color': '#000000',
            'opacity': 1
        });
        
        // Show and highlight prerequisites in the critical path
        criticalPath.forEach(prereqId => {
            if (prereqId === courseId) return; // Skip the clicked course
            
            const prereqNode = cy.getElementById(prereqId);
            prereqNode.removeClass('hidden').style({
                'border-width': '2px',
                'border-color': '#000000',
                'color': '#000000',
                'opacity': 1
            });
            visibleElements.merge(prereqNode);
            
            // Show edges between critical path nodes
            const edgesToHighlight = cy.edges().filter(edge => {
                const sourceId = edge.source().id();
                const targetId = edge.target().id();
                return criticalPath.has(sourceId) && criticalPath.has(targetId);
            });
            
            edgesToHighlight.removeClass('hidden').style({
                'line-color': '#000000',
                'target-arrow-color': '#000000',
                'opacity': 1,
                'width': 3
            });
            
            visibleElements.merge(edgesToHighlight);
        });
        
        // Calculate optimal layout parameters
        const nodeCount = visibleElements.nodes().length;
        const verticalSpacing = Math.max(80, cy.height() / (nodeCount + 1));
        const horizontalSpacing = Math.max(60, cy.width() / (Math.sqrt(nodeCount) * 2));
        
        // Create a new depths map for layout
        const layoutDepths = new Map(depths);
        // Force clicked node to be at maxDepth + 1
        layoutDepths.set(courseId, maxDepth + 1);
        
        // Apply layout to visible elements
        const layout = visibleElements.layout({
            name: 'dagre',
            rankDir: 'TB',
            padding: 30,
            spacingFactor: 1.2,
            animate: true,
            animationDuration: 300,
            rankSep: verticalSpacing,
            nodeSep: horizontalSpacing,
            ranker: 'tight-tree',
            edgeSep: horizontalSpacing * 0.3,
            align: 'DL',
            // Use layoutDepths to position nodes
            rankAssignment: (node) => {
                return layoutDepths.get(node.id()) || 0;
            }
        });
        
        layout.run();
        
        // Update the currently selected node
        currentlySelectedNode = clickedNode;
        
        // Fit the view to the visible elements after layout completes
        setTimeout(() => {
            cy.fit(visibleElements, 50);
            updateTextScaling();
        }, 350);
        
        cy.endBatch();
        clickTimeout = null;
    }, doubleClickDelay);
}

// Remove the old tap handler and add the new one
cy.on('tap', handleNodeClick);

// Add handler to clear click state when dragging/zooming
cy.on('viewport', () => {
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
    }
    lastClickedNode = null;
});

// Function to calculate course complexity and depth
function calculateCourseComplexity(courses) {
    const complexity = new Map();
    const depths = new Map();
    const visited = new Set();
    
    function calculateNodeComplexity(courseId) {
        // If we've already calculated this course's complexity, return it
        if (complexity.has(courseId)) {
            return complexity.get(courseId);
        }
        
        // If we're in a cycle, break it by assigning a temporary complexity
        if (visited.has(courseId)) {
            return 0;
        }
        
        visited.add(courseId);
        const course = courses.find(c => c.id === courseId);
        if (!course) {
            visited.delete(courseId);
            return 0;
        }
        
        // Get all prerequisites and corequisites
        const prereqs = course.prereqs || [];
        const coreqs = course.coreqs || [];
        
        // Calculate complexity based on prerequisites and their depths
        let maxPrereqDepth = 0;
        let totalComplexity = 0;
        
        // Process prerequisites (weighted more heavily than corequisites)
        prereqs.forEach(prereq => {
            const prereqComplexity = calculateNodeComplexity(prereq);
            totalComplexity += prereqComplexity;
            maxPrereqDepth = Math.max(maxPrereqDepth, depths.get(prereq) || 0);
        });
        
        // Process corequisites (weighted less than prerequisites)
        coreqs.forEach(coreq => {
            const coreqComplexity = calculateNodeComplexity(coreq) * 0.5; // Weight coreqs less
            totalComplexity += coreqComplexity;
        });
        
        // Calculate final complexity
        const nodeComplexity = 1 + totalComplexity; // Base complexity of 1 plus dependencies
        complexity.set(courseId, nodeComplexity);
        
        // Calculate depth (level in the tree)
        const depth = prereqs.length > 0 ? maxPrereqDepth + 1 : 0;
        depths.set(courseId, depth);
        
        visited.delete(courseId);
        return nodeComplexity;
    }
    
    // Calculate complexity for all courses
    courses.forEach(course => calculateNodeComplexity(course.id));
    
    return { complexity, depths };
}

// Update the resetView function to restore exact initial positions
function resetView() {
    cy.startBatch();
    
    // Clear search input if it exists
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Reset visibility
    cy.elements().removeClass('hidden');
    
    // Get grade range for colors
    const gradeRange = findGradeRange(currentCourses);
    
    // Reset node styles while preserving grade colors
    cy.nodes().forEach(node => {
        const course = currentCourses.find(c => c.id === node.data('id'));
        const isPastCourse = course?.last_offered ? 
            parseInt(course.last_offered.slice(0, 4)) < 2025 : false;
        
        // Get background color based on grade
        const backgroundColor = course?.avg_grade ? 
            getGradeColor(course.avg_grade, gradeRange.min, gradeRange.max) : 
            '#F5F5F5';  // Default gray for courses without grades
        
        // Apply styles
        const style = {
            'background-color': backgroundColor,
            'border-color': '#000000',  // Black border
            'color': '#000000',         // Black text
            'border-width': '1.5px',
            'opacity': 1
        };
        
        // Add dashed border for past courses
        if (isPastCourse) {
            style['border-style'] = 'dashed';
        }
        
        node.style(style);
    });
    
    // Reset edge styles with black arrows
    cy.edges().forEach(edge => {
        const type = edge.data('type');
        edge.style({
            'line-color': '#000000',
            'target-arrow-color': '#000000',
            'width': type === 'prereq' ? 2.5 : 2,
            'opacity': type === 'prereq' ? 0.9 : 0.7
        });
    });

    // Restore the exact initial positions of all nodes with animation
    if (initialNodePositions) {
        cy.nodes().forEach(node => {
            const pos = initialNodePositions[node.id()];
            if (pos) {
                node.animate({
                    position: pos,
                    duration: 300,
                    easing: 'ease-in-out-cubic'
                });
            }
        });
    }
    
    // Perform view reset operations after animation
    setTimeout(() => {
        cy.fit(40);
        updateTextScaling();
        cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
    }, 350);
    
    cy.endBatch();

    // Update legend with current grade range
    if (gradeRange.min !== null && gradeRange.max !== null) {
        updateGradeLegend(gradeRange.min, gradeRange.max);
    }
}

// Add this helper function to calculate course depth
function calculateCourseDepths(courses) {
    const depths = new Map();
    
    function getDepth(courseId) {
        // If we've already calculated this course's depth, return it
        if (depths.has(courseId)) {
            return depths.get(courseId);
        }
        
        const course = courses.find(c => c.id === courseId);
        if (!course) {
            return 0;
        }
        
        // Get all prerequisites and corequisites
        const allReqs = [...(course.prereqs || []), ...(course.coreqs || [])];
        
        if (allReqs.length === 0) {
            depths.set(courseId, 0);
            return 0;
        }
        
        // Calculate maximum depth of prerequisites
        const maxPrereqDepth = Math.max(...allReqs.map(req => getDepth(req)));
        const depth = maxPrereqDepth + 1;
        
        depths.set(courseId, depth);
        return depth;
    }
    
    // Calculate depths for all courses
    courses.forEach(course => getDepth(course.id));
    
    return depths;
}

// Modify the updateGraph function's layout configuration
function updateGraph() {
    // Update title based on active faculty filter
    const activeFaculties = Array.from(activeFilters.faculty);
    let title = 'עץ הקורסים';
    if (activeFaculties.length === 1 && activeFaculties[0] !== 'all') {
        title = `עץ התואר ב${activeFaculties[0].split('/')[1]}`;
    }
    document.querySelector('h1').textContent = title;
    
    // First, identify courses that are connected
    const connectedCourses = new Set();
    currentCourses.forEach(course => {
        if (course.prereqs?.length > 0 || course.coreqs?.length > 0) {
            connectedCourses.add(course.id);
            if (course.prereqs) {
                course.prereqs.forEach(prereq => connectedCourses.add(prereq));
            }
            if (course.coreqs) {
                course.coreqs.forEach(coreq => connectedCourses.add(coreq));
            }
        }
    });

    // Filter courses based on settings
    const filteredCourses = currentCourses.filter(course => {
        // Check if course should be shown based on its type
        const isTypeAllowed = (
            (course.type && activeFilters.type.has(course.type)) ||
            activeFilters.type.has('all')
        );

        // Check if course should be shown based on connectivity
        const isConnectivityAllowed = showIsolatedCourses || connectedCourses.has(course.id);

        // Course must pass both type and connectivity filters
        return isTypeAllowed && isConnectivityAllowed;
    });

    // Calculate complexity and depths for all filtered courses
    const { complexity, depths } = calculateCourseComplexity(filteredCourses);
    
    // Create graph elements with complexity information
    const elements = {
        nodes: filteredCourses.map(course => ({
            data: {
                id: course.id,
                label: course.id,
                course_link: course.course_link,
                complexity: complexity.get(course.id) || 0,
                depth: depths.get(course.id) || 0,
                isSeminar: course.type === 'סמינר',
                isGuidedReading: course.type === 'קריאה מודרכת',
                isProject: course.type === 'פרוייקט',
                isPastCourse: course.last_offered ? parseInt(course.last_offered.slice(0, 4)) < 2025 : false,
                lastOffered: course.last_offered
            }
        })),
        edges: []
    };

    // Create a set to track edges that have been added
    const addedEdges = new Set();

    // Add edges with priority based on complexity
    filteredCourses.forEach(course => {
        const visibleCourseIds = new Set(filteredCourses.map(c => c.id));
        
        // Helper function to add edge only if it doesn't exist in either direction
        const addEdgeIfNotExists = (source, target, type) => {
            const forwardEdge = `${source}->${target}`;
            const reverseEdge = `${target}->${source}`;

            if (!addedEdges.has(forwardEdge) && !addedEdges.has(reverseEdge)) {
                addedEdges.add(forwardEdge);
                elements.edges.push({
                    data: {
                        source: source,
                        target: target,
                        type: type,
                        weight: complexity.get(source) || 0 // Use complexity for edge weight
                    }
                });
            }
        };

        // Add prerequisite edges
        if (course.prereqs) {
            // Sort prerequisites by complexity
            const sortedPrereqs = course.prereqs
                .filter(prereq => visibleCourseIds.has(prereq))
                .sort((a, b) => (complexity.get(b) || 0) - (complexity.get(a) || 0));
            
            sortedPrereqs.forEach(prereq => {
                addEdgeIfNotExists(prereq, course.id, 'prereq');
            });
        }

        // Add corequisite edges
        if (course.coreqs) {
            // Sort corequisites by complexity
            const sortedCoreqs = course.coreqs
                .filter(coreq => visibleCourseIds.has(coreq))
                .sort((a, b) => (complexity.get(b) || 0) - (complexity.get(a) || 0));
            
            sortedCoreqs.forEach(coreq => {
                addEdgeIfNotExists(course.id, coreq, 'coreq');
            });
        }
    });

    cy.startBatch();
    cy.elements().remove();
    cy.add(elements);
    
    // Get viewport dimensions
    const containerWidth = cy.width();
    const containerHeight = cy.height();
    const nodeCount = elements.nodes.length;
    
    // Calculate optimal spacing based on container size and node count
    const optimalSpacing = Math.min(
        Math.max(40, containerWidth / (Math.sqrt(nodeCount) * 1.5)),
        90
    );
    
    // Get the maximum depth for layout calculations
    const maxDepth = Math.max(...Array.from(depths.values()));
    
    // Modify the initial layout parameters
    initialLayout = {
        name: 'dagre',
        rankDir: 'TB', // Top to Bottom direction
        padding: 30,
        spacingFactor: 1.4,
        animate: false,
        rankSep: optimalSpacing * 1.2,
        nodeSep: optimalSpacing * 1.8,
        ranker: 'tight-tree',
        edgeSep: optimalSpacing * 0.8,
        align: 'UL',
        // Assign ranks based on depth (not inverted anymore)
        rankAssignment: (node) => {
            return depths.get(node.id()) || 0;
        }
    };
    
    // Apply the initial layout
    cy.layout(initialLayout).run();

    // Store the initial positions of all nodes
    initialNodePositions = {};
    cy.nodes().forEach(node => {
        initialNodePositions[node.id()] = {
            x: node.position('x'),
            y: node.position('y')
        };
    });

    // Apply styling based on complexity and grades
    const gradeRange = findGradeRange(currentCourses);

    cy.nodes().forEach(node => {
        const course = currentCourses.find(c => c.id === node.data('id'));
        const isPastCourse = course?.last_offered ? 
            parseInt(course.last_offered.slice(0, 4)) < 2025 : false;
        
        // Get background color based on grade
        const backgroundColor = course?.avg_grade ? 
            getGradeColor(course.avg_grade, gradeRange.min, gradeRange.max) : 
            '#F5F5F5';
        
        // Calculate border width based on complexity (1.5px to 3px)
        const nodeComplexity = complexity.get(node.id()) || 0;
        const maxComplexity = Math.max(...Array.from(complexity.values()));
        const borderWidth = 1.5 + (nodeComplexity / maxComplexity) * 1.5;
        
        let style = {
            'background-color': backgroundColor,
            'border-color': '#000000',
            'color': '#000000',
            'border-width': `${borderWidth}px`
        };
        
        if (isPastCourse) {
            style['border-style'] = 'dashed';
        }
        
        node.style(style);
    });
    
    // Style edges based on type and complexity
    cy.edges().forEach(edge => {
        const type = edge.data('type');
        const weight = edge.data('weight') || 0;
        const maxWeight = Math.max(...elements.edges.map(e => e.data.weight || 0));
        const widthScale = 1 + (weight / maxWeight); // Scale from 1 to 2
        
        edge.style({
            'line-color': '#000000',
            'target-arrow-color': '#000000',
            'width': type === 'prereq' ? 2.5 * widthScale : 2 * widthScale,
            'opacity': type === 'prereq' ? 0.9 : 0.7
        });
    });

    cy.fit(40);
    updateTextScaling();
    cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
    cy.endBatch();

    // Populate filter options after graph update
    populateFilterOptions();

    // Update grade legend if we have grade data
    if (gradeRange.min !== null && gradeRange.max !== null) {
        updateGradeLegend(gradeRange.min, gradeRange.max);
    }
}

// Event listeners with minimal processing
cy.on('dblclick', evt => { if(evt.target === cy) resetView(); });

// Initialize with the same styling as reset view
updateGraph('math');
cy.fit(40);

// Add minimal CSS class for hidden elements
cy.style()
    .selector('.hidden')
    .style({
        'display': 'none'
    })
    .update();

// Add window resize handler to maintain fit
window.addEventListener('resize', _.debounce(() => {
    cy.fit(30);
    updateTextScaling();
}, 250));

// Update initial graph setup
cy.ready(() => {
    // Initial fit
    cy.fit(40);
    // Set a lower minimum zoom to allow more zooming out
    cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
});

// Function to set initial filters
function setInitialFilters() {
    // Reset filters to default values
    activeFilters = {
        faculty: new Set(['מדעים מדויקים/מתמטיקה']),
        year: new Set(['2025']),
        type: new Set(['שיעור']),
        eval: new Set(['all'])
    };

    // Set faculty filter to Mathematics
    const facultySelect = document.getElementById('facultyFilter');
    if (facultySelect) {
        Array.from(facultySelect.options).forEach(option => {
            option.selected = option.value === 'מדעים מדויקים/מתמטיקה';
        });
    }

    // Set year filter to 2025
    const yearSelect = document.getElementById('yearFilter');
    if (yearSelect) {
        Array.from(yearSelect.options).forEach(option => {
            option.selected = option.value === '2025';
        });
    }

    // Set course type filter to שיעור
    const typeSelect = document.getElementById('typeFilter');
    if (typeSelect) {
        Array.from(typeSelect.options).forEach(option => {
            option.selected = option.value === 'שיעור';
        });
    }

    // Set eval filter to all
    const evalSelect = document.getElementById('evalFilter');
    if (evalSelect) {
        Array.from(evalSelect.options).forEach(option => {
            option.selected = option.value === 'all';
        });
    }

    // Apply the filters
    applyFilters();
}

// Initialize instructions when the page loads
function createInstructionsPanel() {
    // Implementation of createInstructionsPanel function
}

// Add these helper functions at the top of the file
function getGradeColor(grade, minGrade, maxGrade) {
    if (!grade) {
        return '#F5F5F5'; // Default gray for courses without grades
    }
    
    // Define the gradient colors from SchemeColor.com
    const colors = [
        '#FF0D0D', // Candy Apple Red
        '#FF4E11', // Orioles Orange
        '#FF8E15', // Beer
        '#FAB733', // Saffron
        '#ACB334', // Brass
        '#69B34C'  // Apple
    ];
    
    // Convert grade to a percentage between 0 and 1
    const percentage = (grade - minGrade) / (maxGrade - minGrade);
    
    // Find the two colors to interpolate between
    const colorIndex = Math.min(Math.floor(percentage * (colors.length - 1)), colors.length - 2);
    const colorPercentage = (percentage * (colors.length - 1)) - colorIndex;
    
    // Convert hex to RGB for interpolation
    const color1 = hexToRgb(colors[colorIndex]);
    const color2 = hexToRgb(colors[colorIndex + 1]);
    
    // Interpolate between the two colors
    const r = Math.round(color1.r + (color2.r - color1.r) * colorPercentage);
    const g = Math.round(color1.g + (color2.g - color1.g) * colorPercentage);
    const b = Math.round(color1.b + (color2.b - color1.b) * colorPercentage);
    
    return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function findGradeRange(courses) {
    let minGrade = Infinity;
    let maxGrade = -Infinity;
    
    courses.forEach(course => {
        if (course.avg_grade) {
            minGrade = Math.min(minGrade, course.avg_grade);
            maxGrade = Math.max(maxGrade, course.avg_grade);
        }
    });
    
    return {
        min: minGrade === Infinity ? null : minGrade,
        max: maxGrade === -Infinity ? null : maxGrade
    };
}

// Add this function to create and update the legend
function updateGradeLegend(minGrade, maxGrade) {
    // Remove existing legend if any
    let legend = document.getElementById('grade-legend');
    if (!legend) {
        // Create legend container
        legend = document.createElement('div');
        legend.id = 'grade-legend';
        legend.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-size: 14px;
            direction: rtl;
            z-index: 999;
        `;
        
        document.body.appendChild(legend);
    }

    // Create gradient bar and labels
    const gradientSteps = 6; // Number of colors in our gradient
    const stepSize = (maxGrade - minGrade) / (gradientSteps - 1);
    
    let legendHTML = '<div style="margin-bottom: 5px;">ממוצע ציונים:</div>';
    
    // Create container for gradient blocks
    legendHTML += '<div style="width: 200px;">';
    
    // Add gradient blocks with numbers
    legendHTML += '<div style="display: flex; position: relative; height: 30px;">';
    for (let i = 0; i < gradientSteps; i++) {
        const grade = minGrade + (i * stepSize);
        const color = getGradeColor(grade, minGrade, maxGrade);
        legendHTML += `
            <div style="
                flex: 1; 
                background-color: ${color}; 
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #000000;
                font-weight: bold;
            ">
                ${Math.round(grade)}
            </div>
        `;
    }
    legendHTML += '</div>';
    legendHTML += '</div>';

    legend.innerHTML = legendHTML;
}

// Function to normalize course number (remove group number)
function normalizeCourseNumber(courseNumber) {
    // Remove group numbers (last two digits) if present
    return courseNumber.substring(0, 8);
}

// Function to find course by name or number
function findCourseByNameOrNumber(nameOrNumber) {
    // First try to find the course directly
    let course = currentCourses.find(c => c.id === nameOrNumber);
    
    // Try to find in math courses first
    for (const [courseNumber, courseInfo] of Object.entries(courses_math)) {
        if (courseInfo.name === nameOrNumber) {
            return courseInfo;
        }
    }

    // Try to find in physics courses
    for (const [courseNumber, courseInfo] of Object.entries(courses_physics)) {
        if (courseInfo.name === nameOrNumber) {
            return courseInfo;
        }
    }

    // If we found a course in currentCourses but need its full data
    if (course) {
        // Extract course number from course_link if available
        const courseNumberMatch = course.course_link?.match(/course=(\d+)/);
        if (courseNumberMatch) {
            const courseNumber = normalizeCourseNumber(courseNumberMatch[1]);
            console.log('Normalized course number:', courseNumber);
            
            // Try to find the course by normalized number in math and physics courses
            if (courses_math[courseNumber]) {
                return courses_math[courseNumber];
            }
            if (courses_physics[courseNumber]) {
                return courses_physics[courseNumber];
            }
        }

        // If we still haven't found the full data, try matching by name
        for (const [courseNumber, courseInfo] of Object.entries(courses_math)) {
            if (courseInfo.name === course.name || courseInfo.name === course.id) {
                return courseInfo;
            }
        }
        for (const [courseNumber, courseInfo] of Object.entries(courses_physics)) {
            if (courseInfo.name === course.name || courseInfo.name === course.id) {
                return courseInfo;
            }
        }
    }

    console.log('Could not find course:', nameOrNumber);
    return null;
}

// Function to create and show grade distribution window
function showGradeDistribution(course) {
    console.log('Showing grade distribution for course:', course); // Debug log

    // Remove any existing grade distribution window
    const existingWindow = document.getElementById('grade-distribution-window');
    if (existingWindow) {
        existingWindow.remove();
    }

    // Use provided courseData if available, otherwise try to find it
    const courseData = course.courseData || findCourseByNameOrNumber(course.id);
    console.log('Using course data:', courseData); // Debug log

    if (!courseData || !courseData.grade_distribution) {
        console.log('No grade distribution data available for course:', course.id);
        return;
    }

    // Create window container
    const window = document.createElement('div');
    window.id = 'grade-distribution-window';
    window.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1000;
        max-width: 800px;
        width: 90%;
        direction: rtl;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        margin-bottom: 20px;
        text-align: center;
        font-weight: bold;
        font-size: 18px;
    `;
    header.textContent = `התפלגות ציונים: ${courseData.name}`;

    // Create histogram container with fixed height and padding
    const histogramContainer = document.createElement('div');
    histogramContainer.style.cssText = `
        display: flex;
        height: 400px;
        margin: 20px 0;
        align-items: flex-end;
        gap: 8px;
        padding: 20px;
        background: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 8px;
        direction: ltr;
    `;

    // Define standard grade ranges (same as Python implementation)
    const standardRanges = [
        '0-49', '50-59', '60-64', '65-69', '70-74',
        '75-79', '80-84', '85-89', '90-94', '95-100'
    ]; // Order from lowest to highest

    // Process and normalize the grade distribution data
    let normalizedDistribution = {};
    let maxCount = 0;
    let totalStudents = 0;

    // Initialize normalized distribution with standard ranges
    standardRanges.forEach(range => {
        normalizedDistribution[range] = 0;
    });

    // Process the grade distribution data
    if (Array.isArray(courseData.grade_distribution)) {
        // Handle array format (assuming order matches standard ranges)
        courseData.grade_distribution.forEach((count, index) => {
            if (index < standardRanges.length) {
                normalizedDistribution[standardRanges[index]] = count;
                maxCount = Math.max(maxCount, count);
                totalStudents += count;
            }
        });
    } else if (typeof courseData.grade_distribution === 'object') {
        // Handle object format with explicit ranges
        Object.entries(courseData.grade_distribution).forEach(([range, count]) => {
            // Find the matching standard range
            const standardRange = standardRanges.find(stdRange => {
                const [stdStart, stdEnd] = stdRange.split('-').map(Number);
                const [start, end] = range.split('-').map(Number);
                return start >= stdStart && end <= stdEnd;
            });

            if (standardRange) {
                normalizedDistribution[standardRange] += count;
                maxCount = Math.max(maxCount, normalizedDistribution[standardRange]);
                totalStudents += count;
            }
        });
    }

    // Create bars for each grade range
    standardRanges.forEach(range => {
        const count = normalizedDistribution[range] || 0;
        const barContainer = document.createElement('div');
        barContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            min-width: 60px;
            height: 100%;
            position: relative;
        `;

        // Create bar with height based on percentage of max
        const bar = document.createElement('div');
        const heightPercentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        bar.style.cssText = `
            width: 100%;
            height: ${heightPercentage}%;
            min-height: ${heightPercentage > 0 ? '2px' : '0'};
            background-color: #2196F3;
            position: relative;
            transition: background-color 0.2s;
            border-radius: 4px 4px 0 0;
            margin-top: auto;
        `;

        // Add hover effect with tooltip
        bar.addEventListener('mouseover', () => {
            bar.style.backgroundColor = '#1976D2';
            // Show tooltip with exact count
            const tooltip = document.createElement('div');
            tooltip.style.cssText = `
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1000;
            `;
            tooltip.textContent = `${count} סטודנטים`;
            bar.appendChild(tooltip);
        });
        bar.addEventListener('mouseout', () => {
            bar.style.backgroundColor = '#2196F3';
            // Remove tooltip
            const tooltip = bar.querySelector('div');
            if (tooltip) tooltip.remove();
        });

        // Add count label
        const countLabel = document.createElement('div');
        countLabel.style.cssText = `
            font-size: 14px;
            color: #333;
            font-weight: bold;
            margin-bottom: 5px;
            text-align: center;
            width: 100%;
        `;
        countLabel.textContent = count;

        // Add range label
        const rangeLabel = document.createElement('div');
        rangeLabel.style.cssText = `
            font-size: 12px;
            color: #666;
            transform: rotate(-45deg);
            transform-origin: right top;
            white-space: nowrap;
            margin-top: 10px;
            text-align: right;
            width: 100%;
        `;
        rangeLabel.textContent = range;

        barContainer.appendChild(countLabel);
        barContainer.appendChild(bar);
        barContainer.appendChild(rangeLabel);
        histogramContainer.appendChild(barContainer);
    });

    // Create footer with statistics
    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 20px;
        text-align: center;
        color: #666;
        font-size: 14px;
        padding: 15px;
        background: #f5f5f5;
        border-radius: 4px;
    `;

    // Calculate and display statistics
    const avgGrade = courseData.avg_grade?.toFixed(2) || 'לא ידוע';
    footer.textContent = `סה"כ סטודנטים: ${totalStudents} | ממוצע: ${avgGrade}`;

    // Add close functionality when clicking outside
    const closeHandler = (e) => {
        // Close if clicking outside the window
        if (!window.contains(e.target)) {
            window.remove();
            document.removeEventListener('click', closeHandler);
            document.removeEventListener('keydown', escapeHandler);
        }
    };

    // Add escape key handler
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            window.remove();
            document.removeEventListener('click', closeHandler);
            document.removeEventListener('keydown', escapeHandler);
        }
    };

    // Add event listeners
    document.addEventListener('click', closeHandler);
    document.addEventListener('keydown', escapeHandler);

    // Prevent window from closing when clicking inside
    window.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 5px 10px;
    `;
    closeButton.textContent = '×';
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        window.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('keydown', escapeHandler);
    });

    // Assemble window
    window.appendChild(closeButton);
    window.appendChild(header);
    window.appendChild(histogramContainer);
    window.appendChild(footer);
    document.body.appendChild(window);
}

// Update the right-click handler
cy.on('cxttap', 'node', function(evt) {
    console.log('Right-click detected on node'); // Debug log
    evt.preventDefault(); // Prevent default context menu
    const node = evt.target;
    const courseId = node.id();
    
    // Add visual feedback when right-clicking
    node.style({
        'border-width': '3px',
        'border-color': '#FF0000'
    });
    setTimeout(() => {
        node.style({
            'border-width': '1.5px',
            'border-color': '#000000'
        });
    }, 200);
    
    console.log('Attempting to show distribution for course:', courseId); // Debug log
    console.log('Node data:', node.data()); // Log node data
    
    // Extract course number from course_link if available
    const courseNumberMatch = node.data('course_link')?.match(/course=(\d+)/);
    let courseNumber = null;
    if (courseNumberMatch) {
        courseNumber = normalizeCourseNumber(courseNumberMatch[1]);
        console.log('Extracted and normalized course number:', courseNumber);
    }
    
    // Debug: Log the available courses
    console.log('Math courses available:', Object.keys(courses_math));
    console.log('Physics courses available:', Object.keys(courses_physics));
    
    // Try to find course by number first
    let course = null;
    if (courseNumber) {
        if (courses_math[courseNumber]) {
            course = courses_math[courseNumber];
            console.log('Found course in math courses:', course);
        } else if (courses_physics[courseNumber]) {
            course = courses_physics[courseNumber];
            console.log('Found course in physics courses:', course);
        } else {
            console.log('Course number not found in either math or physics courses:', courseNumber);
        }
    }
    
    // If not found by number, try by name
    if (!course) {
        course = findCourseByNameOrNumber(courseId);
        console.log('Found course by name:', course);
    }
    
    // Debug: Log the found course data
    console.log('Final course data:', course);
    if (course) {
        console.log('Course grade distribution:', course.grade_distribution);
    }
    
    if (!course) {
        console.error('Could not find course data for:', courseId);
        return;
    }
    
    if (!course.grade_distribution) {
        console.error('No grade distribution data for course:', courseId);
        return;
    }
    
    // Create and show the grade distribution window
    try {
        showGradeDistribution({ id: courseId, courseData: course });
    } catch (error) {
        console.error('Error showing grade distribution:', error);
    }
});

// Also add a context menu prevention on the whole graph
cy.on('cxttap', function(evt) {
    evt.preventDefault();
}); 