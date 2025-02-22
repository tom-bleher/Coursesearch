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

// Load and transform course data from JSON files
async function loadCourseData(type) {
    const path = type === 'math' ? 'Course_data_scraper/Math_courses/courses.json' : 'Course_data_scraper/Physics_courses/courses.json';
    try {
        const response = await fetch(path);
        const data = await response.json();
        
        // Transform the data to match the expected format
        return Object.entries(data)
            .map(([courseNumber, courseInfo]) => {
                // Check course types
                const isSeminar = courseInfo.specific_data.some(data => data["אופן הוראה"] === "סמינר");
                const isGuidedReading = courseInfo.specific_data.some(data => data["אופן הוראה"] === "קריאה מודרכת");
                const isProject = courseInfo.specific_data.some(data => data["אופן הוראה"] === "פרוייקט");
                
                return {
                    id: courseInfo.course_name,
                    name: {
                        he: courseInfo.course_name,
                        en: courseInfo.course_name
                    },
                    course_link: courseInfo.course_link,
                    prereqs: courseInfo.pre_req.map(preReqNum => {
                        const preReqCourse = data[preReqNum];
                        return preReqCourse ? preReqCourse.course_name : '';
                    }).filter(name => name !== ''),
                    coreqs: courseInfo.parallel_req.map(coReqNum => {
                        const coReqCourse = data[coReqNum];
                        return coReqCourse ? coReqCourse.course_name : '';
                    }).filter(name => name !== ''),
                    category: 'general',
                    isSeminar: isSeminar,
                    isGuidedReading: isGuidedReading,
                    isProject: isProject
                };
            });
    } catch (error) {
        console.error('Error loading course data:', error);
        return [];
    }
}

// Initialize course data
async function initializeCourseData() {
    courses_math = await loadCourseData('math');
    courses_physics = await loadCourseData('physics');
    currentCourses = courses_math;
    updateGraph('math'); // Initial load with math courses
}

// Call initialization when the page loads
window.addEventListener('load', initializeCourseData);

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
function updateGraph(courseType) {
    currentCourses = courseType === 'math' ? courses_math : courses_physics;
    document.querySelector('h1').textContent = courseType === 'math' ? 'עץ התואר במתמטיקה' : 'עץ התואר בפיזיקה';
    
    // First, identify courses that are connected (either as source or target)
    const connectedCourses = new Set();
    currentCourses.forEach(course => {
        if (course.prereqs.length > 0 || course.coreqs.length > 0) {
            connectedCourses.add(course.id);
            course.prereqs.forEach(prereq => connectedCourses.add(prereq));
            course.coreqs.forEach(coreq => connectedCourses.add(coreq));
        }
    });

    // Filter courses based on settings and connectivity
    const filteredCourses = currentCourses.filter(course => {
        if (!showSeminars && course.isSeminar) return false;
        if (!showGuidedReading && course.isGuidedReading) return false;
        if (!showProjects && course.isProject) return false;
        if (!showIsolatedCourses && !connectedCourses.has(course.id)) return false;
        return true;
    });
    
    const elements = {
        nodes: filteredCourses.map(course => ({
            data: {
                id: course.id,
                label: course.id,
                course_link: course.course_link,
                isSeminar: course.isSeminar,
                isGuidedReading: course.isGuidedReading,
                isProject: course.isProject
            }
        })),
        edges: filteredCourses.flatMap(course => {
            const edges = new Set();
            const result = [];
            
            // Only add edges for visible courses
            const visibleCourseIds = new Set(filteredCourses.map(c => c.id));
            
            course.prereqs.forEach(prereq => {
                if (visibleCourseIds.has(prereq)) {
                const edge = `${prereq}->${course.id}`;
                if (!edges.has(edge)) {
                    edges.add(edge);
                    result.push({
                        data: {
                            source: prereq,
                            target: course.id,
                            type: 'prereq'
                        }
                    });
                    }
                }
            });
            
            course.coreqs.forEach(coreq => {
                if (visibleCourseIds.has(coreq)) {
                const edge = `${coreq}->${course.id}`;
                if (!edges.has(edge)) {
                    edges.add(edge);
                    result.push({
                        data: {
                            source: coreq,
                            target: course.id,
                            type: 'coreq'
                        }
                    });
                    }
                }
            });
            
            return result;
        })
    };

    cy.startBatch();
    cy.elements().remove();
    cy.add(elements);
    
    // Get viewport dimensions
    const containerWidth = cy.width();
    const containerHeight = cy.height();
    const nodeCount = elements.nodes.length;
    
    // Calculate optimal spacing based on container size and node count
    const optimalSpacing = Math.min(
        Math.max(30, containerWidth / (nodeCount * 0.8)),
        60
    );
    
    // Store the initial layout parameters
    initialLayout = {
        name: 'dagre',
        rankDir: 'TB',
        padding: 50,
        spacingFactor: 1.6,
        animate: false,
        rankSep: optimalSpacing * 1.5,
        nodeSep: optimalSpacing * 1.2,
        ranker: 'network-simplex',
        edgeSep: optimalSpacing * 0.6
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
        const isSeminar = node.data('isSeminar');
        const isGuidedReading = node.data('isGuidedReading');
        const isProject = node.data('isProject');
        
        let style;
        if (isSeminar) {
            style = {
                'background-color': '#E8F5E9',
                'border-color': '#43A047',
                'color': '#2E7D32'
            };
        } else if (isGuidedReading) {
            style = {
                'background-color': '#FFF3E0',
                'border-color': '#F57C00',
                'color': '#E65100'
            };
        } else if (isProject) {
            style = {
                'background-color': '#E3F2FD',
                'border-color': '#1976D2',
                'color': '#0D47A1'
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
    // Set a lower minimum zoom to allow more zooming out
    cy.minZoom(Math.min(cy.zoom() * 0.6, 0.5));
    cy.endBatch();
}

// Event listeners with minimal processing
document.querySelectorAll('input[name="course-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => updateGraph(e.target.value));
});

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

// Add settings menu HTML
function createSettingsMenu() {
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'settings-menu';
    settingsDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        direction: rtl;
    `;

    // Helper function to create toggle containers
    function createToggle(label, checked, onChange) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        `;

        const labelElem = document.createElement('label');
        labelElem.textContent = label;
        labelElem.style.cssText = `
            font-size: 14px;
            color: #333;
        `;

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = checked;
        toggle.style.cssText = `
            width: 16px;
            height: 16px;
        `;

        toggle.addEventListener('change', onChange);

        container.appendChild(labelElem);
        container.appendChild(toggle);
        return container;
    }

    // Create course type toggles
    const seminarToggle = createToggle('הצג סמינרים', showSeminars, (e) => {
        showSeminars = e.target.checked;
        updateGraph(currentCourses === courses_math ? 'math' : 'physics');
    });

    const guidedReadingToggle = createToggle('הצג קריאה מודרכת', showGuidedReading, (e) => {
        showGuidedReading = e.target.checked;
        updateGraph(currentCourses === courses_math ? 'math' : 'physics');
    });

    const projectToggle = createToggle('הצג פרוייקטים', showProjects, (e) => {
        showProjects = e.target.checked;
        updateGraph(currentCourses === courses_math ? 'math' : 'physics');
    });

    // Add divider
    const divider = document.createElement('div');
    divider.style.cssText = `
        height: 1px;
        background-color: #E0E0E0;
        margin: 10px 0;
    `;

    // Create isolated courses toggle with updated text and behavior
    const isolatedToggle = createToggle('הצג קורסים מנותקים', showIsolatedCourses, (e) => {
        showIsolatedCourses = e.target.checked;
        updateGraph(currentCourses === courses_math ? 'math' : 'physics');
    });

    settingsDiv.appendChild(seminarToggle);
    settingsDiv.appendChild(guidedReadingToggle);
    settingsDiv.appendChild(projectToggle);
    settingsDiv.appendChild(divider);
    settingsDiv.appendChild(isolatedToggle);
    document.body.appendChild(settingsDiv);
}

// Initialize settings menu and instructions when the page loads
window.addEventListener('load', () => {
    initializeCourseData();
    createSettingsMenu();
    createInstructionsPanel();
}); 