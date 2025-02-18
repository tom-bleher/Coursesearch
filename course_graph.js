// Course data
const courses_math = [
    {"id": "חדוא 1", "name": {"he": "חדוא 1", "en": "Calculus 1"}, "prereqs": [], "coreqs": [], "category": "analysis"},
    {"id": "לינארית 1", "name": {"he": "לינארית 1", "en": "Linear Algebra 1"}, "prereqs": [], "coreqs": [], "category": "algebra"},
    {"id": "מבוא לתורת הקבוצות", "name": {"he": "מבוא לתורת הקבוצות", "en": "Introduction to Set Theory"}, "prereqs": [], "coreqs": [], "category": "foundations"},
    {"id": "מבוא מורחב למדמ״ח", "name": {"he": "מבוא מורחב למדמ״ח", "en": "Extended Introduction to Computer Science"}, "prereqs": [], "coreqs": ["מבוא לתורת הקבוצות"], "category": "computer_science"},
    {"id": "קומבינטוריקה", "name": {"he": "קומבינטוריקה", "en": "Combinatorics"}, "prereqs": ["חדוא 1", "לינארית 1"], "coreqs": ["מבוא לתורת הקבוצות"], "category": "discrete"},
    {"id": "חדוא 2", "name": {"he": "חדוא 2", "en": "Calculus 2"}, "prereqs": ["חדוא 1"], "coreqs": [], "category": "analysis"},
    {"id": "לינארית 2", "name": {"he": "לינארית 2", "en": "Linear Algebra 2"}, "prereqs": ["לינארית 1"], "coreqs": [], "category": "algebra"},
    {"id": "מבוא להסתברות", "name": {"he": "מבוא להסתברות", "en": "Introduction to Probability"}, "prereqs": ["קומבינטוריקה", "מבוא לתורת הקבוצות"], "coreqs": ["חדוא 2", "לינארית 2"], "category": "probability"},
    {"id": "חבורות", "name": {"he": "חבורות", "en": "Group Theory"}, "prereqs": [], "coreqs": ["לינארית 2"], "category": "algebra"},
    {"id": "קומבינטוריקה בסיסית", "name": {"he": "קומבינטוריקה בסיסית", "en": "Basic Combinatorics"}, "prereqs": ["קומבינטוריקה"], "coreqs": [], "category": "discrete"},
    {"id": "תורת הגרפים", "name": {"he": "תורת הגרפים", "en": "Graph Theory"}, "prereqs": ["מבוא להסתברות"], "coreqs": [], "category": "discrete"},
    {"id": "שיטות מתמטיות בתורת המשחקים", "name": {"he": "שיטות מתמטיות בתורת המשחקים", "en": "Mathematical Methods in Game Theory"}, "prereqs": ["מבוא להסתברות"], "coreqs": [], "category": "applications"},
    {"id": "תורת המספרים", "name": {"he": "תורת המספרים", "en": "Number Theory"}, "prereqs": ["חדוא 2", "לינארית 2"], "coreqs": [], "category": "algebra"},
    {"id": "חדוא 3", "name": {"he": "חדוא 3", "en": "Calculus 3"}, "prereqs": ["חדוא 2", "לינארית 2", "קומבינטוריקה"], "coreqs": [], "category": "analysis"},
    {"id": "תורת ההצגות", "name": {"he": "תורת ההצגות", "en": "Representation Theory"}, "prereqs": ["חבורות"], "coreqs": [], "category": "algebra"},
    {"id": "גלואה", "name": {"he": "גלואה", "en": "Galois Theory"}, "prereqs": ["חבורות"], "coreqs": [], "category": "algebra"},
    {"id": "אלגברה קומוטטיבית", "name": {"he": "אלגברה קומוטטיבית", "en": "Commutative Algebra"}, "prereqs": ["חבורות"], "coreqs": [], "category": "algebra"},
    {"id": "ODE", "name": {"he": "ODE", "en": "Ordinary Differential Equations"}, "prereqs": ["לינארית 2"], "coreqs": ["חדוא 3"], "category": "analysis"},
    {"id": "גאומטריה דיפרנציאלית", "name": {"he": "גאומטריה דיפרנציאלית", "en": "Differential Geometry"}, "prereqs": ["לינארית 2"], "coreqs": ["חדוא 3", "ODE"], "category": "geometry"},
    {"id": "ממשיות", "name": {"he": "ממשיות", "en": "Real Analysis"}, "prereqs": ["לינארית 2"], "coreqs": ["חדוא 3"], "category": "analysis"},
    {"id": "מרוכבות 1", "name": {"he": "מרוכבות 1", "en": "Complex Analysis 1"}, "prereqs": ["חדוא 2"], "coreqs": ["חדוא 3"], "category": "analysis"},
    {"id": "אנליזה נומרית", "name": {"he": "אנליזה נומרית", "en": "Numerical Analysis"}, "prereqs": ["מבוא מורחב למדמ״ח", "חדוא 2", "לינארית 2"], "coreqs": [], "category": "applications"},
    {"id": "חישוב מדעי", "name": {"he": "חישוב מדעי", "en": "Scientific Computing"}, "prereqs": ["אנליזה נומרית", "מרוכבות 1"], "coreqs": [], "category": "applications"},
    {"id": "הילברט", "name": {"he": "הילברט", "en": "Hilbert Spaces"}, "prereqs": ["חדוא 2", "לינארית 2", "מבוא מורחב למדמ״ח"], "coreqs": [], "category": "analysis"},
    {"id": "טופולוגיה", "name": {"he": "טופולוגיה", "en": "Topology"}, "prereqs": ["חדוא 2", "מבוא לתורת הקבוצות"], "coreqs": [], "category": "topology"},
    {"id": "אנליזה פונקציונלית", "name": {"he": "אנליזה פונקציונלית", "en": "Functional Analysis"}, "prereqs": ["הילברט"], "coreqs": ["ממשיות", "טופולוגיה"], "category": "analysis"},
    {"id": "לוגיקה", "name": {"he": "לוגיקה", "en": "Logic"}, "prereqs": ["מבוא לתורת הקבוצות"], "coreqs": [], "category": "foundations"},
    {"id": "אנליזה על יריעות", "name": {"he": "אנליזה על יריעות", "en": "Analysis on Manifolds"}, "prereqs": ["גאומטריה דיפרנציאלית", "טופולוגיה"], "coreqs": [], "category": "geometry"},
    {"id": "חדוא 4", "name": {"he": "חדוא 4", "en": "Calculus 4"}, "prereqs": ["חדוא 3"], "coreqs": [], "category": "analysis"},
    {"id": "מד״ח", "name": {"he": "מד״ח", "en": "Partial Differential Equations"}, "prereqs": ["ODE"], "coreqs": ["חדוא 4", "מרוכבות 1"], "category": "analysis"},
    {"id": "מרוכבות 2", "name": {"he": "מרוכבות 2", "en": "Complex Analysis 2"}, "prereqs": ["מרוכבות 1"], "coreqs": [], "category": "analysis"},
    {"id": "אנליזה הרמונית", "name": {"he": "אנליזה הרמונית", "en": "Harmonic Analysis"}, "prereqs": ["ממשיות", "מרוכבות 1"], "coreqs": [], "category": "analysis"},
    {"id": "הסתברות למתמטיקאים", "name": {"he": "הסתברות למתמטיקאים", "en": "Probability for Mathematicians"}, "prereqs": ["ממשיות", "מבוא להסתברות"], "coreqs": [], "category": "probability"},
    {"id": "משחקי בורל", "name": {"he": "משחקי בורל", "en": "Borel Games"}, "prereqs": ["הסתברות למתמטיקאים"], "coreqs": [], "category": "probability"},
    {"id": "מבוא לתהליכים מקריים", "name": {"he": "מבוא לתהליכים מקריים", "en": "Introduction to Stochastic Processes"}, "prereqs": ["הסתברות למתמטיקאים"], "coreqs": [], "category": "probability"},
    {"id": "תורת הקבוצות", "name": {"he": "תורת הקבוצות", "en": "Set Theory"}, "prereqs": ["לינארית 1", "חדוא 1"], "coreqs": [], "category": "foundations"}
];

const courses_physics = [
    {"id": "אלגברה לינארית", "name": {"he": "אלגברה לינארית", "en": "Linear Algebra for Physics"}, "prereqs": [], "coreqs": [], "category": "mathematics"},
    {"id": "קלאסית 1", "name": {"he": "קלאסית 1", "en": "Classical Physics 1"}, "prereqs": [], "coreqs": [], "category": "classical_physics"},
    {"id": "קלאסית 2", "name": {"he": "קלאסית 2", "en": "Classical Physics 2"}, "prereqs": ["קלאסית 1"], "coreqs": ["ממפיס 2", "יחסות פרטית"], "category": "classical_physics"},
    {"id": "מבוא לתרמודינמיקה ומצבי צבירה", "name": {"he": "מבוא לתרמודינמיקה ומצבי צבירה", "en": "Introduction to Thermodynamics and States of Matter"}, "prereqs": ["ממפיס 1", "קלאסית 1"], "coreqs": [], "category": "thermodynamics"},
    {"id": "מחשבים לפיזיקאים", "name": {"he": "מחשבים לפיזיקאים", "en": "Computing for Physicists"}, "prereqs": [], "coreqs": [], "category": "computing"},
    {"id": "יחסות פרטית", "name": {"he": "יחסות פרטית", "en": "Special Relativity"}, "prereqs": ["קלאסית 1"], "coreqs": [], "category": "relativity"},
    {"id": "הסתברות וסטטיסטיקה", "name": {"he": "הסתברות וסטטיסטיקה", "en": "Probability and Statistics"}, "prereqs": [], "coreqs": [], "category": "mathematics"},
    {"id": "ממפיס 1", "name": {"he": "ממפיס 1", "en": "Mathematical Methods in Physics 1"}, "prereqs": [], "coreqs": ["אלגברה לינארית"], "category": "mathematics"},
    {"id": "ממפיס 2", "name": {"he": "ממפיס 2", "en": "Mathematical Methods in Physics 2"}, "prereqs": ["ממפיס 1", "אלגברה לינארית"], "coreqs": [], "category": "mathematics"},
    {"id": "גלים", "name": {"he": "גלים", "en": "Waves"}, "prereqs": ["קלאסית 1", "קלאסית 2"], "coreqs": ["שיטות בפיזיקה עיונית 1"], "category": "waves"},
    {"id": "קוונטים 1", "name": {"he": "קוונטים 1", "en": "Quantum Physics 1"}, "prereqs": ["מכניקה אנליטית", "גלים", "שיטות בפיזיקה עיונית 1"], "coreqs": ["הסתברות וסטטיסטיקה"], "category": "quantum"},
    {"id": "מכניקה אנליטית", "name": {"he": "מכניקה אנליטית", "en": "Analytical Mechanics"}, "prereqs": ["קלאסית 1", "ממפיס 1", "ממפיס 2", "אלגברה לינארית"], "coreqs": ["שיטות בפיזיקה עיונית 1"], "category": "classical_physics"},
    {"id": "פיזיקה סטטיסטית", "name": {"he": "פיזיקה סטטיסטית", "en": "Statistical Physics"}, "prereqs": ["מבוא לתרמודינמיקה ומצבי צבירה", "הסתברות וסטטיסטיקה"], "coreqs": ["קוונטים 1"], "category": "statistical_physics"},
    {"id": "שיטות נומריות", "name": {"he": "שיטות נומריות", "en": "Numerical Methods"}, "prereqs": ["מחשבים לפיזיקאים", "אלגברה לינארית"], "coreqs": [], "category": "computing"},
    {"id": "שיטות בפיזיקה עיונית 1", "name": {"he": "שיטות בפיזיקה עיונית 1", "en": "Methods in Theoretical Physics 1"}, "prereqs": ["ממפיס 1", "ממפיס 2", "אלגברה לינארית"], "coreqs": [], "category": "theoretical_physics"},
    {"id": "שיטות בפיזיקה עיונית 2", "name": {"he": "שיטות בפיזיקה עיונית 2", "en": "Methods in Theoretical Physics 2"}, "prereqs": ["שיטות בפיזיקה עיונית 1", "ממפיס 1", "ממפיס 2", "אלגברה לינארית"], "coreqs": [], "category": "theoretical_physics"},
    {"id": "קוונטים 2", "name": {"he": "קוונטים 2", "en": "Quantum Physics 2"}, "prereqs": ["קוונטים 1"], "coreqs": [], "category": "quantum"},
    {"id": "מבוא למצב מוצק", "name": {"he": "מבוא למצב מוצק", "en": "Introduction to Solid State Physics"}, "prereqs": ["פיזיקה סטטיסטית", "קוונטים 1"], "coreqs": ["קוונטים 2"], "category": "solid_state"},
    {"id": "מבוא לאסטרופיזיקה", "name": {"he": "מבוא לאסטרופיזיקה", "en": "Introduction to Astrophysics"}, "prereqs": ["מכניקה אנליטית", "יחסות פרטית", "קוונטים 1"], "coreqs": [], "category": "astrophysics"},
    {"id": "אלקטרומגנטיות אנליטית", "name": {"he": "אלקטרומגנטיות אנליטית", "en": "Analytical Electromagnetism"}, "prereqs": ["קלאסית 2", "יחסות פרטית", "גלים", "שיטות בפיזיקה עיונית 1", "שיטות בפיזיקה עיונית 2", "מכניקה אנליטית"], "coreqs": [], "category": "electromagnetism"},
    {"id": "מצב מוצק 2", "name": {"he": "מצב מוצק 2", "en": "Solid State Physics 2"}, "prereqs": ["מבוא למצב מוצק", "פיזיקה סטטיסטית"], "coreqs": [], "category": "solid_state"},
    {"id": "פיזיקה של סדרי גודל", "name": {"he": "פיזיקה של סדרי גודל", "en": "Order of Magnitude Physics"}, "prereqs": [], "coreqs": [], "category": "general"},
    {"id": "מבוא לחלקיקים וגרעין", "name": {"he": "מבוא לחלקיקים וגרעין", "en": "Introduction to Particles and Nuclear Physics"}, "prereqs": ["קוונטים 1"], "coreqs": [], "category": "particle_physics"},
    {"id": "יחסות כללית", "name": {"he": "יחסות כללית", "en": "General Relativity"}, "prereqs": ["יחסות פרטית"], "coreqs": ["אלקטרומגנטיות אנליטית"], "category": "relativity"},
    {"id": "חומרה קוונטית", "name": {"he": "חומרה קוונטית", "en": "Quantum Hardware"}, "prereqs": ["קוונטים 1"], "coreqs": [], "category": "quantum"},
    {"id": "מבוא לאינפורמציה ואלגוריתמים קוונטיים", "name": {"he": "מבוא לאינפורמציה ואלגוריתמים קוונטיים", "en": "Introduction to Quantum Information and Algorithms"}, "prereqs": ["קוונטים 1"], "coreqs": [], "category": "quantum"},
    {"id": "תורת השדות 1", "name": {"he": "תורת השדות 1", "en": "Field Theory 1"}, "prereqs": [], "coreqs": [], "category": "field_theory"},
    {"id": "תורת השדות 2", "name": {"he": "תורת השדות 2", "en": "Field Theory 2"}, "prereqs": ["תורת השדות 1"], "coreqs": [], "category": "field_theory"},
    {"id": "תורת השדות 3", "name": {"he": "תורת השדות 3", "en": "Field Theory 3"}, "prereqs": ["תורת השדות 1", "תורת השדות 2"], "coreqs": [], "category": "field_theory"},
    {"id": "תורת החלקיקים 1", "name": {"he": "תורת החלקיקים 1", "en": "Particle Physics 1"}, "prereqs": ["תורת השדות 1"], "coreqs": [], "category": "particle_physics"},
    {"id": "תורת החלקיקים 2", "name": {"he": "תורת החלקיקים 2", "en": "Particle Physics 2"}, "prereqs": ["תורת החלקיקים 1"], "coreqs": [], "category": "particle_physics"}
];

// Prepare the elements for Cytoscape
const elements = {
    nodes: [],
    edges: []
};

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
    minZoom: 0.3,
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

let currentCourses = courses_math;

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
    
    // Then show and style the relevant elements
    matches.removeClass('hidden').style({
        'background-color': '#FFF3E0',
        'border-width': '2.5px',
        'border-color': '#F57C00',
        'color': '#E65100'
    });

    neighbors.removeClass('hidden').style({
        'background-color': '#F5F5F5',
        'border-width': '1.5px',
        'border-color': '#78909C',
        'color': '#455A64'
    });

    connectedEdges.removeClass('hidden');

    // Create a collection of all visible elements
    const visibleElements = matches.union(connectedEdges).union(neighbors);
    
    // Center and fit the view on visible elements with padding
    cy.fit(visibleElements, 50);
    
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

// Update the reset view function to ensure proper reset sequence
function resetView() {
    cy.startBatch();
    
    // Clear search input if it exists
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Reset visibility first
    cy.elements().removeClass('hidden');
    
    // Reset node styles to default gray
    cy.nodes().style({
        'background-color': '#F5F5F5',
        'border-width': '1.5px',
        'border-color': '#78909C',
        'color': '#455A64'
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

    cy.endBatch();
    
    // Perform view reset operations outside of batch
    cy.fit(40);
    updateTextScaling();
    
    // Update minZoom to match current zoom level
    cy.minZoom(cy.zoom());
}

// Update the updateGraph function to include text scaling
function updateGraph(courseType) {
    const courses = courseType === 'math' ? courses_math : courses_physics;
    document.querySelector('h1').textContent = courseType === 'math' ? 'עץ התואר במתמטיקה' : 'עץ התואר בפיזיקה';
    
    const elements = {
        nodes: courses.map(course => ({
            data: {
                id: course.id,
                label: course.id
            }
        })),
        edges: courses.flatMap(course => [
            ...course.prereqs.map(prereq => ({
                data: {
                    source: prereq,
                    target: course.id,
                    type: 'prereq'
                }
            })),
            ...course.coreqs.map(coreq => ({
                data: {
                    source: coreq,
                    target: course.id,
                    type: 'coreq'
                }
            }))
        ])
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
    
    cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        padding: 50,
        spacingFactor: 1.6,
        animate: false,
        rankSep: optimalSpacing * 1.5,
        nodeSep: optimalSpacing * 1.2,
        ranker: 'network-simplex',
        edgeSep: optimalSpacing * 0.6
    }).run();

    // Apply the same styling as reset view
    cy.nodes().style({
        'background-color': '#F5F5F5',
        'border-width': '1.5px',
        'border-color': '#78909C',
        'color': '#455A64'
    });
    
    // Update edge styles with new black arrows
    cy.edges().forEach(edge => {
        const type = edge.data('type');
        edge.style({
            'line-color': '#000000',
            'target-arrow-color': '#000000',
            'width': type === 'prereq' ? 2.5 : 2,
            'opacity': type === 'prereq' ? 0.9 : 0.7
        });
    });

    // Ensure the graph fits in the viewport
    cy.fit(40);
    updateTextScaling();
    
    // Update minZoom to match current zoom level
    cy.minZoom(cy.zoom());
    
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
    // Set initial minZoom based on the fit level
    cy.minZoom(cy.zoom());
}); 