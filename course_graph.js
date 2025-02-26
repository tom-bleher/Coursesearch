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

    // Update current courses and graph
    currentCourses = filteredCourses;
    // Always hide isolated courses
    showIsolatedCourses = false;
    updateGraph();
}

// Event listeners for filter controls
document.addEventListener('DOMContentLoaded', () => {
    // Handle filter changes
    ['facultyFilter', 'yearFilter', 'typeFilter', 'evalFilter'].forEach(id => {
        const select = document.getElementById(id);
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
    });

    // Handle apply filters button
    document.getElementById('applyFilters').addEventListener('click', applyFilters);

    // Handle universal reset button
    document.getElementById('resetAll').addEventListener('click', () => {
        // Reset filters
        activeFilters = {
            faculty: new Set(['מדעים מדויקים/מתמטיקה']),
            year: new Set(['2025']),
            type: new Set(['שיעור']),
            eval: new Set(['all'])
        };

        // Reset select elements
        ['facultyFilter', 'yearFilter', 'typeFilter', 'evalFilter'].forEach(id => {
            const select = document.getElementById(id);
            Array.from(select.options).forEach(option => {
                if (id === 'facultyFilter') {
                    option.selected = option.value === 'מדעים מדויקים/מתמטיקה';
                } else if (id === 'yearFilter') {
                    option.selected = option.value === '2025';
                } else if (id === 'typeFilter') {
                    option.selected = option.value === 'שיעור';
                } else {
                    option.selected = option.value === 'all';
                }
            });
        });

        // Clear search input
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset graph view
        cy.startBatch();
        
        // Reset visibility
        cy.elements().removeClass('hidden');
        
        // Reset node styles to default
        cy.nodes().style({
            'background-color': '#F5F5F5',
            'border-width': '1.5px',
            'border-color': '#78909C',
            'color': '#455A64',
            'opacity': 1
        });
        
        // Reset edge styles
        cy.edges().forEach(edge => {
            const type = edge.data('type');
            edge.style({
                'line-color': '#000000',
                'target-arrow-color': '#000000',
                'width': type === 'prereq' ? 2.5 : 2,
                'opacity': type === 'prereq' ? 0.9 : 0.7
            });
        });

        // Restore initial positions with animation
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
        
        // Update view after animation
        setTimeout(() => {
            cy.fit(40);
            updateTextScaling();
            cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
        }, 350);
        
        cy.endBatch();

        // Apply filters to update the graph
        applyFilters();
    });
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

        // Process math courses
        courses_math = Object.entries(mathData)
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

                // Preserve the original type and normalize it
                const originalType = courseInfo.type;
                const normalizedType = normalizeType(originalType);
                
                return {
                    id: courseInfo.name,
                    name: {
                        he: courseInfo.name,
                        en: courseInfo.name
                    },
                    course_link: courseInfo.course_link,
                    faculty: 'מדעים מדויקים/מתמטיקה',
                    original_type: originalType,
                    type: normalizedType,
                    eval_type: Array.isArray(courseInfo.eval_type) ?
                        courseInfo.eval_type.map(normalizeEvalType) :
                        normalizeEvalType(courseInfo.eval_type),
                    prereqs: processedPrereqs,
                    coreqs: processedCoreqs,
                    last_offered: courseInfo.last_offered
                };
            });

        // Process physics courses with the same careful type handling
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

                // Preserve the original type and normalize it
                const originalType = courseInfo.type;
                const normalizedType = normalizeType(originalType);

                return {
                    id: courseInfo.name,
                    name: {
                        he: courseInfo.name,
                        en: courseInfo.name
                    },
                    course_link: courseInfo.course_link,
                    faculty: 'מדעים מדויקים/פיזיקה',
                    original_type: originalType,
                    type: normalizedType,
                    eval_type: Array.isArray(courseInfo.eval_type) ?
                        courseInfo.eval_type.map(normalizeEvalType) :
                        normalizeEvalType(courseInfo.eval_type),
                    prereqs: processedPrereqs,
                    coreqs: processedCoreqs,
                    last_offered: courseInfo.last_offered
                };
            });

        // Set initial courses to all courses
        currentCourses = [...courses_math, ...courses_physics];
        
        // Log all unique types for debugging
        const allTypes = new Set([
            ...currentCourses.map(c => c.original_type),
            ...currentCourses.map(c => c.type)
        ]);
        console.log('All unique types in data:', Array.from(allTypes));
        
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
    
    // Show and highlight the matched nodes (orange like clicked nodes)
    matches.removeClass('hidden').style({
        'background-color': '#FFF3E0',
        'border-width': '2.5px',
        'border-color': '#F57C00',
        'color': '#E65100',
        'opacity': 1
    });

    // Show and highlight neighbors (blue like prerequisites)
    neighbors.removeClass('hidden').style({
        'background-color': '#E3F2FD',
        'border-width': '2px',
        'border-color': '#1976D2',
        'color': '#0D47A1',
        'opacity': 1
    });

    // Show and highlight edges
    connectedEdges.removeClass('hidden').style({
        'line-color': '#1976D2',
        'target-arrow-color': '#1976D2',
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
    
    // Apply layout to visible elements - using same parameters as handleNodeClick
    const layout = visibleElements.layout({
        name: 'dagre',
        rankDir: 'TB',
        padding: 30,
        spacingFactor: 1 + (1 / nodeCount),
        animate: true,
        animationDuration: 300,
        rankSep: verticalSpacing,
        nodeSep: horizontalSpacing,
        ranker: 'tight-tree',
        edgeSep: horizontalSpacing * 0.3,
        align: 'DL'
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
const doubleClickDelay = 300; // milliseconds

// Function to handle node clicks
function handleNodeClick(event) {
    const clickedNode = event.target;
    
    // If clicking background, reset view
    if (event.target === cy) {
        resetView();
        lastClickedNode = null;
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
        
        // Open course link in new tab if available
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
        
        // Check if clicking the currently highlighted node
        const bgColor = clickedNode.style('background-color');
        const borderColor = clickedNode.style('border-color');
        
        // Convert RGB to hex for comparison
        const rgbToHex = (rgb) => {
            // Extract RGB values using regex
            const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            if (!match) return rgb; // Return original if not RGB format
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
        };

        // Convert colors to hex for comparison
        const bgHex = rgbToHex(bgColor);
        const borderHex = rgbToHex(borderColor);
        
        // Check if this is the highlighted node (orange background and border)
        if (bgHex === '#FFF3E0' && borderHex === '#F57C00') {
            resetView();
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
        
        // Get all prerequisites
        const prerequisites = getAllPrerequisites(courseId, courses);
        
        // Create a collection of visible elements
        const visibleElements = cy.collection();
        visibleElements.merge(clickedNode);
        
        // Show and highlight the target course
        clickedNode.removeClass('hidden').style({
            'background-color': '#FFF3E0',
            'border-width': '2.5px',
            'border-color': '#F57C00',
            'color': '#E65100',
            'opacity': 1
        });
        
        // Show and highlight prerequisites
        prerequisites.forEach(prereqId => {
            const prereqNode = cy.getElementById(prereqId);
            prereqNode.removeClass('hidden').style({
                'background-color': '#E3F2FD',
                'border-width': '2px',
                'border-color': '#1976D2',
                'color': '#0D47A1',
                'opacity': 1
            });
            visibleElements.merge(prereqNode);
            
            // Show and highlight edges between prerequisites
            const edgesToHighlight = cy.edges().filter(edge => {
                const sourceId = edge.source().id();
                const targetId = edge.target().id();
                return (prerequisites.has(sourceId) && prerequisites.has(targetId)) ||
                       (prerequisites.has(sourceId) && targetId === courseId) ||
                       (sourceId === courseId && prerequisites.has(targetId));
            });
            
            edgesToHighlight.removeClass('hidden').style({
                'line-color': '#1976D2',
                'target-arrow-color': '#1976D2',
                'opacity': 1
            });
            
            visibleElements.merge(edgesToHighlight);
        });
        
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
            rankDir: 'TB',
            padding: 30,
            spacingFactor: 1 + (1 / nodeCount),
            animate: true,
            animationDuration: 300,
            rankSep: verticalSpacing,
            nodeSep: horizontalSpacing,
            ranker: 'tight-tree',
            edgeSep: horizontalSpacing * 0.3,
            align: 'DL'
        });
        
        layout.run();
        
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

// Function to get all prerequisites recursively
function getAllPrerequisites(courseId, courses) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return new Set();
    
    const prerequisites = new Set();
    
    // Add direct prerequisites
    course.prereqs.forEach(prereq => {
        prerequisites.add(prereq);
        // Recursively add prerequisites of prerequisites
        getAllPrerequisites(prereq, courses).forEach(p => prerequisites.add(p));
    });
    
    // Add corequisites and their prerequisites
    course.coreqs.forEach(coreq => {
        prerequisites.add(coreq);
        // Recursively add prerequisites of corequisites
        getAllPrerequisites(coreq, courses).forEach(p => prerequisites.add(p));
    });
    
    return prerequisites;
}

// Update the resetView function to restore exact initial positions
function resetView() {
    cy.startBatch();
    
    // Clear search input if it exists
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Reset visibility first
    cy.elements().removeClass('hidden');
    
    // Reset node styles to default gray with full opacity
    cy.nodes().style({
        'background-color': '#F5F5F5',
        'border-width': '1.5px',
        'border-color': '#78909C',
        'color': '#455A64',
        'opacity': 1
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
        // Set a lower minimum zoom to allow more zooming out
        cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
    }, 350);
    
    cy.endBatch();
}

// Update the updateGraph function to handle isolated courses
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
    
    const elements = {
        nodes: filteredCourses.map(course => ({
            data: {
                id: course.id,
                label: course.id,
                course_link: course.course_link,
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

    // Add edges for prerequisites and corequisites
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
                        type: type
                        }
                    });
                    }
        };

        // Add prerequisite edges
        if (course.prereqs) {
            course.prereqs.forEach(prereq => {
                if (visibleCourseIds.has(prereq)) {
                    addEdgeIfNotExists(prereq, course.id, 'prereq');
                }
            });
        }

        // Add corequisite edges
        if (course.coreqs) {
            course.coreqs.forEach(coreq => {
                if (visibleCourseIds.has(coreq)) {
                    addEdgeIfNotExists(course.id, coreq, 'coreq');
                }
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
        Math.max(40, containerWidth / (Math.sqrt(nodeCount) * 1.5)),  // Less aggressive vertical compression
        90  // Increased maximum spacing
    );
    
    // Store the initial layout parameters
    initialLayout = {
        name: 'dagre',
        rankDir: 'TB',
        padding: 30,
        spacingFactor: 1.4,  // Increased spacing factor for more horizontal spread
        animate: false,
        rankSep: optimalSpacing * 1.0,  // Reduced vertical separation to compress height
        nodeSep: optimalSpacing * 1.8,  // Increased horizontal separation for wider spread
        ranker: 'tight-tree',
        edgeSep: optimalSpacing * 0.8,  // Increased edge separation
        align: 'UL',  // Changed alignment to Upper-Left for better horizontal distribution
        acyclicer: 'greedy',
        maximal: false
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

    // Apply styling
    cy.nodes().forEach(node => {
        const course = currentCourses.find(c => c.id === node.data('id'));
        const isPastCourse = course?.last_offered ? 
            parseInt(course.last_offered.slice(0, 4)) < 2025 : false;
        
        let style;
        if (course?.type === 'סמינר') {
            style = {
                'background-color': '#E8F5E9',
                'border-color': '#43A047',
                'color': '#2E7D32'
            };
        } else if (course?.type === 'קריאה מודרכת') {
            style = {
                'background-color': '#FFF3E0',
                'border-color': '#F57C00',
                'color': '#E65100'
            };
        } else if (course?.type === 'פרוייקט') {
            style = {
                'background-color': '#E3F2FD',
                'border-color': '#1976D2',
                'color': '#0D47A1'
            };
        } else if (isPastCourse) {
            style = {
                'background-color': '#FFEBEE',
                'border-color': '#D32F2F',
                'color': '#B71C1C',
                'border-style': 'dashed'
            };
        } else {
            style = {
                'background-color': '#F5F5F5',
                'border-color': '#78909C',
                'color': '#455A64'
            };
        }
        
        node.style({
            ...style,
            'border-width': '1.5px'
        });
    });
    
    cy.edges().forEach(edge => {
        const type = edge.data('type');
        edge.style({
            'line-color': '#000000',
            'target-arrow-color': '#000000',
            'width': type === 'prereq' ? 2.5 : 2,
            'opacity': type === 'prereq' ? 0.9 : 0.7
        });
    });

    cy.fit(40);
    updateTextScaling();
    cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
    cy.endBatch();

    // Populate filter options after graph update
    populateFilterOptions();
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
    // Set faculty filter to Mathematics
    const facultySelect = document.getElementById('facultyFilter');
    Array.from(facultySelect.options).forEach(option => {
        option.selected = option.value === 'מדעים מדויקים/מתמטיקה';
    });

    // Set year filter to 2025
    const yearSelect = document.getElementById('yearFilter');
    Array.from(yearSelect.options).forEach(option => {
        option.selected = option.value === '2025';
    });

    // Set course type filter to שיעור
    const typeSelect = document.getElementById('typeFilter');
    Array.from(typeSelect.options).forEach(option => {
        option.selected = option.value === 'שיעור';
    });

    // Apply the filters
    applyFilters();
}

// Initialize instructions when the page loads
function createInstructionsPanel() {
    // Implementation of createInstructionsPanel function
} 