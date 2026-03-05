// ── Constants & State ────────────────────────────────────────────────────────
const CURRENT_YEAR = '2026';

let courses_math = [];
let courses_physics = [];
let rawMathData = {};
let rawPhysicsData = {};
let currentCourses = [];
let initialNodePositions = null;
let planningMode = false;
let isNodeSelected = false;
let currentlySelectedNode = null;
let showIsolatedCourses = false;
let lastClickedNode = null;
let clickTimeout = null;
const DOUBLE_CLICK_DELAY = 300;
let takenCourses = new Set(JSON.parse(localStorage.getItem('coursesearch_taken') || '[]'));

// ── Mappings ─────────────────────────────────────────────────────────────────
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

const evalTypeMapping = {
    'Final Exam': 'בחינה סופית',
    'Paper': 'עבודת בית',
    'Project': 'פרוייקט',
    'Other': 'אחר',
    'Take-home exam': 'בחינת בית',
    'Attendance': 'נוכחות',
    'Class Participation': 'השתתפות בכיתה'
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeType(type) {
    if (!type) return null;
    if (/[\u0590-\u05FF]/.test(type)) return type;
    return typeMapping[type] || type;
}

function normalizeEvalType(evalType) {
    if (!evalType) return null;
    if (/[\u0590-\u05FF]/.test(evalType)) return evalType;
    return evalTypeMapping[evalType] || evalType;
}

function extractYear(lastOffered) {
    return lastOffered ? lastOffered.slice(0, 4) : null;
}

function getYearLevel(courseId) {
    if (typeof courseId !== 'string' || courseId.length < 5) return 0;
    const level = parseInt(courseId.charAt(4));
    return (level >= 1 && level <= 4) ? level : 0;
}

function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function getGradeColor(grade, minGrade, maxGrade) {
    if (!grade) return '#f7f8fa';
    const colors = ['#FF0D0D', '#FF4E11', '#FF8E15', '#FAB733', '#ACB334', '#69B34C'];
    const pct = Math.max(0, Math.min(1, (grade - minGrade) / (maxGrade - minGrade)));
    const idx = Math.min(Math.floor(pct * (colors.length - 1)), colors.length - 2);
    const sub = (pct * (colors.length - 1)) - idx;
    const c1 = hexToRgb(colors[idx]), c2 = hexToRgb(colors[idx + 1]);
    return `rgb(${Math.round(c1.r + (c2.r - c1.r) * sub)}, ${Math.round(c1.g + (c2.g - c1.g) * sub)}, ${Math.round(c1.b + (c2.b - c1.b) * sub)})`;
}

function findGradeRange(courses) {
    let min = Infinity, max = -Infinity;
    courses.forEach(c => {
        if (c.avg_grade) { min = Math.min(min, c.avg_grade); max = Math.max(max, c.avg_grade); }
    });
    return { min: min === Infinity ? null : min, max: max === -Infinity ? null : max };
}

function normalizeCourseNumber(num) {
    return num.substring(0, 8);
}

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadCourseData() {
    const [mathResponse, physicsResponse] = await Promise.all([
        fetch('courses/JSONs/math.json'),
        fetch('courses/JSONs/physics.json')
    ]);
    const mathData = await mathResponse.json();
    const physicsData = await physicsResponse.json();

    // Keep raw data for grade distribution lookups
    rawMathData = mathData;
    rawPhysicsData = physicsData;

    function processCourses(data, otherData, faculty) {
        return Object.entries(data).map(([courseNumber, info]) => {
            const prereqs = (info.preq || [])
                .filter(p => p !== 'וגם' && p !== 'או')
                .map(n => (data[n] || otherData[n])?.name || null)
                .filter(n => n !== null);
            const coreqs = (info.pareq || [])
                .filter(p => p !== 'וגם' && p !== 'או')
                .map(n => (data[n] || otherData[n])?.name || null)
                .filter(n => n !== null);

            return {
                id: info.name,
                course_id: courseNumber,
                name: info.name,
                course_link: info.course_link,
                faculty: faculty,
                type: normalizeType(info.type),
                eval_type: Array.isArray(info.eval_type)
                    ? info.eval_type.map(normalizeEvalType)
                    : normalizeEvalType(info.eval_type),
                prereqs,
                coreqs,
                last_offered: info.last_offered,
                avg_grade: info.avg_grade,
                grade_distribution: info.grade_distribution,
                total_students: info.total_students
            };
        });
    }

    courses_math = processCourses(mathData, physicsData, 'מדעים מדויקים/מתמטיקה');
    courses_physics = processCourses(physicsData, mathData, 'מדעים מדויקים/פיזיקה');
    currentCourses = [...courses_math, ...courses_physics];
}

// ── Filters ──────────────────────────────────────────────────────────────────
let activeFilters = {
    faculty: new Set(['מדעים מדויקים/מתמטיקה']),
    year: new Set([CURRENT_YEAR]),
    type: new Set(['שיעור']),
    eval: new Set(['all'])
};

function populateFilterOptions() {
    const faculties = new Set(['מדעים מדויקים/מתמטיקה', 'מדעים מדויקים/פיזיקה']);
    const years = new Set(), types = new Set(), evals = new Set();

    // Collect from courses matching current faculty filter
    const selectedFaculties = Array.from(activeFilters.faculty);
    const relevantCourses = [...courses_math, ...courses_physics].filter(c =>
        selectedFaculties.includes('all') || selectedFaculties.includes(c.faculty)
    );

    // Count occurrences for sorting
    const typeCounts = new Map(), evalCounts = new Map();
    relevantCourses.forEach(c => {
        if (c.last_offered) years.add(extractYear(c.last_offered));
        if (c.type) {
            types.add(c.type);
            typeCounts.set(c.type, (typeCounts.get(c.type) || 0) + 1);
        }
        if (Array.isArray(c.eval_type)) {
            c.eval_type.forEach(e => { if (e) { evals.add(e); evalCounts.set(e, (evalCounts.get(e) || 0) + 1); } });
        } else if (c.eval_type) {
            evals.add(c.eval_type);
            evalCounts.set(c.eval_type, (evalCounts.get(c.eval_type) || 0) + 1);
        }
    });

    function fill(selectId, options, activeSet, counts, sortByCount) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';

        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = selectId === 'yearFilter' ? 'כל השנים' : 'הכל';
        allOpt.selected = activeSet.has('all');
        select.appendChild(allOpt);

        let sorted = Array.from(options);
        if (selectId === 'yearFilter') {
            sorted.sort((a, b) => parseInt(b) - parseInt(a));
        } else if (sortByCount && counts) {
            sorted.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
        } else {
            sorted.sort();
        }

        sorted.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt;
            if (selectId === 'facultyFilter') {
                el.textContent = opt.split('/')[1] || opt;
            } else if (counts && counts.get(opt)) {
                el.textContent = `${opt} (${counts.get(opt)})`;
            } else {
                el.textContent = opt;
            }
            el.selected = activeSet.has(opt);
            select.appendChild(el);
        });
    }

    fill('facultyFilter', faculties, activeFilters.faculty, null, false);
    fill('yearFilter', years, activeFilters.year, null, false);
    fill('typeFilter', types, activeFilters.type, typeCounts, true);
    fill('evalFilter', evals, activeFilters.eval, evalCounts, true);
}

function applyFilters() {
    const allCourses = [...courses_math, ...courses_physics];
    currentCourses = allCourses.filter(course => {
        if (!activeFilters.faculty.has('all') && !activeFilters.faculty.has(course.faculty)) return false;
        if (!activeFilters.year.has('all')) {
            const yr = extractYear(course.last_offered);
            if (!yr || !activeFilters.year.has(yr)) return false;
        }
        if (!activeFilters.type.has('all') && !activeFilters.type.has(course.type)) return false;
        if (!activeFilters.eval.has('all')) {
            if (!course.eval_type) return false;
            if (Array.isArray(course.eval_type)) {
                if (!course.eval_type.some(e => activeFilters.eval.has(e))) return false;
            } else {
                if (!activeFilters.eval.has(course.eval_type)) return false;
            }
        }
        return true;
    });
    updateGraph();
}

function setInitialFilters() {
    activeFilters = {
        faculty: new Set(['מדעים מדויקים/מתמטיקה']),
        year: new Set([CURRENT_YEAR]),
        type: new Set(['שיעור']),
        eval: new Set(['all'])
    };
    populateFilterOptions();
    applyFilters();
}

// ── Cytoscape Init ───────────────────────────────────────────────────────────
const NODE_W = 155;
const NODE_H = 50;

const cy = cytoscape({
    container: document.getElementById('cy'),
    style: [
        {
            selector: 'node',
            style: {
                'label': 'data(label)',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': '#f7f8fa',
                'text-wrap': 'wrap',
                'text-max-width': NODE_W - 16,
                'font-size': 11,
                'font-weight': 'bold',
                'width': NODE_W,
                'height': NODE_H,
                'padding': 6,
                'shape': 'roundrectangle',
                'border-width': 1.5,
                'border-color': '#78909C',
                'transition-property': 'background-color, opacity, border-color',
                'transition-duration': '0.2s',
                'color': '#1a1a2e'
            }
        },
        {
            selector: 'edge[type="prereq"]',
            style: {
                'width': 2,
                'line-color': '#78909c',
                'target-arrow-color': '#78909c',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'opacity': 0.6,
                'arrow-scale': 1
            }
        },
        {
            selector: 'edge[type="coreq"]',
            style: {
                'width': 1.5,
                'line-color': '#90a4ae',
                'target-arrow-color': '#90a4ae',
                'target-arrow-shape': 'triangle',
                'line-style': 'dashed',
                'curve-style': 'bezier',
                'opacity': 0.45,
                'arrow-scale': 1
            }
        },
        {
            selector: '.hidden',
            style: { 'display': 'none' }
        },
        {
            selector: '.depth-label',
            style: { 'display': 'none' }
        }
    ],
    layout: { name: 'preset' },
    minZoom: 0.15,
    maxZoom: 3,
    wheelSensitivity: 0.3
});

// ── Graph Logic ──────────────────────────────────────────────────────────────
function calculateCourseComplexity(courses) {
    const complexity = new Map(), depths = new Map(), visited = new Set();

    function calc(courseId) {
        if (complexity.has(courseId)) return complexity.get(courseId);
        if (visited.has(courseId)) return 0;
        visited.add(courseId);

        const course = courses.find(c => c.id === courseId);
        if (!course) { visited.delete(courseId); return 0; }

        let maxDepth = 0, total = 0;
        (course.prereqs || []).forEach(p => {
            total += calc(p);
            maxDepth = Math.max(maxDepth, depths.get(p) || 0);
        });
        (course.coreqs || []).forEach(p => { total += calc(p) * 0.5; });

        let baseDepth = 0;
        if (course.course_id && course.course_id.length >= 5) {
            const yearDigit = parseInt(course.course_id.charAt(4));
            if (!isNaN(yearDigit) && yearDigit >= 1 && yearDigit <= 4) {
                baseDepth = yearDigit - 1;
            } else if (!isNaN(yearDigit) && yearDigit >= 5) {
                baseDepth = 3; // Graduate-level courses → year 4+
            }
        }

        const c = 1 + total;
        complexity.set(courseId, c);
        
        let calculatedDepth = course.prereqs?.length ? maxDepth + 1 : baseDepth;
        depths.set(courseId, Math.max(calculatedDepth, baseDepth));
        
        visited.delete(courseId);
        return c;
    }

    courses.forEach(c => calc(c.id));
    return { complexity, depths };
}

function updateGraph() {
    // Update title based on faculty filter
    const activeFaculties = Array.from(activeFilters.faculty);
    let title = 'עץ הקורסים';
    if (activeFaculties.length === 1 && activeFaculties[0] !== 'all') {
        title = `עץ התואר ב${activeFaculties[0].split('/')[1]}`;
    }
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = title;

    // Identify connected courses
    const connectedCourses = new Set();
    currentCourses.forEach(course => {
        if (course.prereqs?.length > 0 || course.coreqs?.length > 0) {
            connectedCourses.add(course.id);
            (course.prereqs || []).forEach(p => connectedCourses.add(p));
            (course.coreqs || []).forEach(p => connectedCourses.add(p));
        }
    });

    // Hide ב/ג level variants (e.g. חדו"א 1ב, אלגברה לינארית 1ג) — the math
    // major uses only the א level; these lower variants clutter the tree.
    const nonAlephSuffix = /\s[12][בג]$/;

    // Filter by type, connectivity, and variant level
    const filteredCourses = currentCourses.filter(course => {
        if (nonAlephSuffix.test(course.name)) return false;
        const typeOk = activeFilters.type.has('all') || activeFilters.type.has(course.type);
        const connectOk = showIsolatedCourses || connectedCourses.has(course.id);
        return typeOk && connectOk;
    });

    const { complexity, depths } = calculateCourseComplexity(filteredCourses);

    const elements = {
        nodes: filteredCourses.map(course => ({
            data: {
                id: course.id,
                label: course.id,
                course_link: course.course_link,
                complexity: complexity.get(course.id) || 0,
                depth: depths.get(course.id) || 0,
                isPastCourse: course.last_offered
                    ? parseInt(extractYear(course.last_offered)) < parseInt(CURRENT_YEAR)
                    : false,
                lastOffered: course.last_offered
            }
        })),
        edges: []
    };

    // Add edges with deduplication
    const addedEdges = new Set();
    const visibleIds = new Set(filteredCourses.map(c => c.id));

    filteredCourses.forEach(course => {
        function addEdge(source, target, type) {
            const fwd = `${source}->${target}`;
            const rev = `${target}->${source}`;
            if (!addedEdges.has(fwd) && !addedEdges.has(rev)) {
                addedEdges.add(fwd);
                elements.edges.push({
                    data: { source, target, type, weight: complexity.get(source) || 0 }
                });
            }
        }
        (course.prereqs || []).filter(p => visibleIds.has(p)).forEach(p => addEdge(p, course.id, 'prereq'));
        (course.coreqs || []).filter(p => visibleIds.has(p)).forEach(p => addEdge(course.id, p, 'coreq'));
    });

    cy.startBatch();
    cy.elements().remove();
    cy.add(elements);

    // Use dagre for x-positioning (crossing minimization), then fix y for depth
    const layoutOpts = {
        name: 'dagre',
        rankDir: 'TB',
        padding: 30,
        animate: false,
        rankSep: NODE_H * 2,
        nodeSep: 25,
        edgeSep: 15,
        ranker: 'longest-path',
        minLen: function(edge) {
            return edge.data('type') === 'coreq' ? 0 : 1;
        }
    };

    try {
        cy.layout(layoutOpts).run();
    } catch (layoutErr) {
        layoutOpts.ranker = 'network-simplex';
        cy.layout(layoutOpts).run();
    }

    // Fix y-positions for strict hierarchical ordering
    enforceDepthOrdering(depths);

    // Store initial positions
    initialNodePositions = {};
    cy.nodes().not('.depth-label').forEach(n => {
        initialNodePositions[n.id()] = { x: n.position('x'), y: n.position('y') };
    });

    addDepthIndicators(depths);

    // Apply node styling
    const gradeRange = findGradeRange(currentCourses);

    cy.nodes().not('.depth-label').forEach(node => {
        const course = currentCourses.find(c => c.id === node.data('id'));
        const isPast = node.data('isPastCourse');
        const bg = course?.avg_grade
            ? getGradeColor(course.avg_grade, gradeRange.min, gradeRange.max)
            : '#f7f8fa';

        const style = {
            'background-color': bg,
            'border-color': '#546e7a',
            'color': '#1a1a2e',
            'border-width': 1.5,
            'opacity': 1
        };
        if (isPast) style['border-style'] = 'dashed';
        node.style(style);
    });

    const courseNodes = cy.nodes().not('.depth-label');
    cy.fit(courseNodes, 30);
    cy.minZoom(Math.min(cy.zoom() * 0.5, 0.15));
    cy.endBatch();

    populateFilterOptions();
    if (gradeRange.min !== null && gradeRange.max !== null) {
        updateGradeLegend(gradeRange.min, gradeRange.max);
    }
}

function updateGradeLegend(min, max) {
    const minEl = document.getElementById('gradeLegendMin');
    const maxEl = document.getElementById('gradeLegendMax');
    if (minEl) minEl.textContent = Math.round(min);
    if (maxEl) maxEl.textContent = Math.round(max);
}

// ── Year Band Labels ─────────────────────────────────────────────────────────
// Render horizontal year labels as HTML overlays that track the graph via
// Cytoscape's pan/zoom. Matches TAU's program structure (שנה א׳, ב׳, ג׳).
const YEAR_LABELS = ["שנה א׳", "שנה ב׳", "שנה ג׳", "שנה ד׳+"];

function updateYearBands(depths) {
    const container = document.getElementById('yearBands');
    if (!container) return;
    container.innerHTML = '';

    const courseNodes = cy.nodes().not('.depth-label');
    if (courseNodes.length === 0) return;

    // Group by depth to find row y-positions
    const depthGroups = new Map();
    courseNodes.forEach(n => {
        const d = depths.get(n.id()) || 0;
        if (!depthGroups.has(d)) depthGroups.set(d, []);
        depthGroups.get(d).push(n);
    });

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    if (sortedDepths.length === 0) return;

    // Compute the rendered pixel position of each depth row's center
    const cyContainer = cy.container().getBoundingClientRect();
    const pan = cy.pan();
    const zoom = cy.zoom();

    // Compute top/bottom of each band in rendered pixels
    const rowPositions = sortedDepths.map(d => {
        const group = depthGroups.get(d);
        const avgModelY = group.reduce((s, n) => s + n.position('y'), 0) / group.length;
        return { depth: d, renderedY: avgModelY * zoom + pan.y };
    });

    // Determine band boundaries: midpoint between rows
    for (let i = 0; i < rowPositions.length; i++) {
        const rp = rowPositions[i];
        const top = i === 0 ? 0 : (rowPositions[i - 1].renderedY + rp.renderedY) / 2;
        const bottom = i === rowPositions.length - 1
            ? cyContainer.height
            : (rp.renderedY + rowPositions[i + 1].renderedY) / 2;

        const band = document.createElement('div');
        band.className = 'year-band';
        band.style.top = `${Math.max(0, top)}px`;
        band.style.height = `${Math.max(0, bottom - top)}px`;
        if (rp.depth % 2 === 1) {
            band.style.background = 'rgba(74, 111, 165, 0.03)';
        }

        const label = document.createElement('div');
        label.className = 'year-band-label';
        label.textContent = YEAR_LABELS[Math.min(rp.depth, YEAR_LABELS.length - 1)];
        band.appendChild(label);
        container.appendChild(band);
    }
}

// Keep bands in sync with pan/zoom
let _lastDepths = null;
cy.on('viewport', () => { if (_lastDepths) updateYearBands(_lastDepths); });

function addDepthIndicators(depths) {
    _lastDepths = depths;
    updateYearBands(depths);
}

// Build a clean flowchart layout: each depth level gets its own row,
// nodes are evenly spaced within each row, and the whole graph is
// sized to fit the viewport while keeping nodes readable.
function enforceDepthOrdering(depths) {
    const courseNodes = cy.nodes().not('.depth-label');
    if (courseNodes.length === 0) return;

    // Group nodes by depth, keeping dagre's x-order within each group
    const depthGroups = new Map();
    courseNodes.forEach(n => {
        const d = depths.get(n.id()) || 0;
        if (!depthGroups.has(d)) depthGroups.set(d, []);
        depthGroups.get(d).push(n);
    });

    // Sort nodes within each row by dagre's x-position (preserves crossing minimization)
    depthGroups.forEach(group => group.sort((a, b) => a.position('x') - b.position('x')));

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    if (sortedDepths.length === 0) return;

    // Adaptive sizing: scale node width so the widest row fits the viewport
    const maxRowCount = Math.max(...Array.from(depthGroups.values()).map(g => g.length));
    const viewW = cy.width();
    const viewH = cy.height();
    const margin = 60; // left/right margin for year labels + padding

    // Target: widest row fits in viewport with padding
    const availW = viewW - margin;
    const idealNodeW = (availW - (maxRowCount - 1) * 30) / maxRowCount;
    const nodeW = Math.max(Math.min(idealNodeW, NODE_W), 100); // clamp 100–NODE_W
    const nodeH = NODE_H * (nodeW / NODE_W);                   // scale proportionally
    const hGap = Math.max(nodeW * 0.2, 15);

    // Vertical: distribute rows evenly across viewport height
    const numRows = sortedDepths.length;
    const totalNodeH = numRows * nodeH;
    const availH = viewH - 60; // top/bottom padding
    const vGap = Math.max((availH - totalNodeH) / Math.max(numRows - 1, 1), nodeH * 1.2);

    // Apply computed node sizes
    courseNodes.forEach(n => {
        n.style({ 'width': nodeW, 'height': nodeH, 'font-size': Math.max(9, 11 * (nodeW / NODE_W)),
                   'text-max-width': nodeW - 14 });
    });

    // Compute the total width of the widest row for centering
    const maxRowWidth = maxRowCount * nodeW + (maxRowCount - 1) * hGap;

    // Position each row: center-aligned horizontally, stacked vertically
    sortedDepths.forEach((d, rowIdx) => {
        const group = depthGroups.get(d);
        const rowWidth = group.length * nodeW + (group.length - 1) * hGap;
        const startX = (maxRowWidth - rowWidth) / 2;
        const y = rowIdx * (nodeH + vGap);

        group.forEach((n, colIdx) => {
            n.position({
                x: startX + colIdx * (nodeW + hGap) + nodeW / 2,
                y: y
            });
        });
    });
}

function resetView() {
    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.value = '';
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.classList.remove('visible');

    isNodeSelected = false;
    currentlySelectedNode = null;

    cy.startBatch();
    cy.elements().removeClass('hidden');

    const gradeRange = findGradeRange(currentCourses);
    const { complexity } = calculateCourseComplexity(currentCourses);
    const maxComplexity = Math.max(...Array.from(complexity.values()), 1);

    cy.nodes().not('.depth-label').forEach(node => {
        const course = currentCourses.find(c => c.id === node.data('id'));
        const isPast = course?.last_offered
            ? parseInt(extractYear(course.last_offered)) < parseInt(CURRENT_YEAR)
            : false;
        const bg = course?.avg_grade
            ? getGradeColor(course.avg_grade, gradeRange.min, gradeRange.max)
            : '#f7f8fa';

        const style = {
            'background-color': bg,
            'border-color': '#546e7a',
            'color': '#1a1a2e',
            'border-width': 1.5,
            'opacity': 1,
            'border-style': isPast ? 'dashed' : 'solid'
        };
        node.style(style);
    });

    cy.edges().forEach(edge => {
        const type = edge.data('type');
        edge.style({
            'line-color': type === 'prereq' ? '#78909c' : '#90a4ae',
            'target-arrow-color': type === 'prereq' ? '#78909c' : '#90a4ae',
            'width': type === 'prereq' ? 2 : 1.5,
            'opacity': type === 'prereq' ? 0.6 : 0.45
        });
    });

    if (initialNodePositions) {
        cy.nodes().forEach(node => {
            const pos = initialNodePositions[node.id()];
            if (pos) node.animate({ position: pos, duration: 300, easing: 'ease-in-out-cubic' });
        });
    }

    setTimeout(() => cy.fit(40), 350);

    cy.endBatch();
}

// ── Search ───────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('search');
const searchDropdown = document.getElementById('searchDropdown');

if (searchInput) {
    searchInput.addEventListener('input', _.debounce((e) => {
        const term = e.target.value.toLowerCase().trim();
        if (!term) {
            searchDropdown?.classList.remove('visible');
            return;
        }

        // Search across ALL courses, ignoring current filters
        const allCourses = [...courses_math, ...courses_physics];
        const matches = allCourses.filter(c => c.name.toLowerCase().includes(term)).slice(0, 10);

        if (matches.length === 0) {
            searchDropdown.innerHTML = '<div class="search-dropdown-item" style="color:#999;">לא נמצאו תוצאות</div>';
            searchDropdown?.classList.add('visible');
            return;
        }

        searchDropdown.innerHTML = matches.map(c => {
            const avgText = c.avg_grade ? `ממוצע: ${c.avg_grade.toFixed(1)}` : '';
            return `<div class="search-dropdown-item" data-id="${c.id}">
                <div>${c.name}</div>
                ${avgText ? `<div class="search-item-sub">${avgText}</div>` : ''}
            </div>`;
        }).join('');
        searchDropdown?.classList.add('visible');

        // Add click handlers
        searchDropdown.querySelectorAll('.search-dropdown-item[data-id]').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                searchDropdown.classList.remove('visible');
                searchInput.value = id;
                selectSearchResult(id);
            });
        });
    }, 200));
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
        searchDropdown?.classList.remove('visible');
    }
});

function selectSearchResult(courseId) {
    // Ensure the course is visible in the graph
    const allCourses = [...courses_math, ...courses_physics];
    const course = allCourses.find(c => c.id === courseId);
    if (!course) return;

    // Check if node exists in current graph
    let node = cy.getElementById(courseId);

    if (!node.length) {
        // Node not in current graph — add it and its neighbors temporarily
        const needed = new Set([courseId]);
        (course.prereqs || []).forEach(p => needed.add(p));
        (course.coreqs || []).forEach(p => needed.add(p));

        // Also add courses that depend on this one
        allCourses.forEach(c => {
            if ((c.prereqs || []).includes(courseId) || (c.coreqs || []).includes(courseId)) {
                needed.add(c.id);
            }
        });

        needed.forEach(id => {
            if (!cy.getElementById(id).length) {
                const c = allCourses.find(x => x.id === id);
                if (c) cy.add({ data: { id: c.id, label: c.id, course_link: c.course_link } });
            }
        });

        // Add edges
        needed.forEach(id => {
            const c = allCourses.find(x => x.id === id);
            if (!c) return;
            (c.prereqs || []).forEach(p => {
                if (needed.has(p) && !cy.edges(`[source="${p}"][target="${id}"]`).length) {
                    cy.add({ data: { source: p, target: id, type: 'prereq' } });
                }
            });
        });

        node = cy.getElementById(courseId);
    }

    if (node.length) {
        // Simulate a click on the node to show its prereq path
        showNodePrereqPath(node);
    }
}

// ── Node Interaction ─────────────────────────────────────────────────────────
function getMinimalPrerequisitePath(courseId, courses) {
    const path = new Set();
    const visited = new Set();

    function walk(id) {
        if (visited.has(id)) return;
        visited.add(id);
        path.add(id);
        const c = courses.find(x => x.id === id);
        if (c) (c.prereqs || []).forEach(walk);
    }
    walk(courseId);
    return path;
}

function getDependentCourses(courseId, courses) {
    const deps = new Set();
    courses.forEach(c => {
        if ((c.prereqs || []).includes(courseId) || (c.coreqs || []).includes(courseId)) {
            deps.add(c.id);
        }
    });
    return deps;
}

function showNodePrereqPath(clickedNode) {
    const courseId = clickedNode.id();
    const allCourses = [...courses_math, ...courses_physics];

    cy.startBatch();
    cy.elements().addClass('hidden');

    const path = getMinimalPrerequisitePath(courseId, allCourses);
    const deps = getDependentCourses(courseId, allCourses);
    const visible = new Set([...path, ...deps]);

    const visibleElements = cy.collection();

    // Show clicked node with bold border
    clickedNode.removeClass('hidden').style({
        'border-width': '3px',
        'border-color': '#1a1a2e',
        'color': '#1a1a2e',
        'opacity': 1
    });
    visibleElements.merge(clickedNode);

    // Show path and dependent nodes
    visible.forEach(id => {
        if (id === courseId) return;
        const node = cy.getElementById(id);
        if (node.length) {
            node.removeClass('hidden').style({
                'border-width': '2px',
                'border-color': '#1a1a2e',
                'color': '#1a1a2e',
                'opacity': 1
            });
            visibleElements.merge(node);
        }
    });

    // Show edges between visible nodes
    cy.edges().forEach(edge => {
        if (visible.has(edge.source().id()) && visible.has(edge.target().id())) {
            edge.removeClass('hidden').style({
                'line-color': '#1a1a2e',
                'target-arrow-color': '#1a1a2e',
                'opacity': 1,
                'width': 3
            });
            visibleElements.merge(edge);
        }
    });

    // Layout the sub-graph
    const subLayoutOpts = {
        name: 'dagre',
        rankDir: 'TB',
        padding: 30,
        animate: true,
        animationDuration: 300,
        rankSep: NODE_H * 2.5,
        nodeSep: NODE_W * 0.4,
        ranker: 'longest-path',
        minLen: function(edge) {
            return edge.data('type') === 'coreq' ? 0 : 1;
        }
    };
    try {
        visibleElements.layout(subLayoutOpts).run();
    } catch (e) {
        subLayoutOpts.ranker = 'network-simplex';
        visibleElements.layout(subLayoutOpts).run();
    }

    currentlySelectedNode = clickedNode;
    isNodeSelected = true;

    setTimeout(() => cy.fit(visibleElements, 50), 350);

    cy.endBatch();
}

function handleNodeClick(event) {
    const target = event.target;

    // Click on background → reset
    if (target === cy) {
        resetView();
        lastClickedNode = null;
        currentlySelectedNode = null;
        if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
        return;
    }
    if (!target.isNode() || target.hasClass('depth-label')) return;

    // Planning mode
    if (planningMode) {
        const id = target.id();
        if (takenCourses.has(id)) takenCourses.delete(id);
        else takenCourses.add(id);
        localStorage.setItem('coursesearch_taken', JSON.stringify([...takenCourses]));
        applyPlanningStyles();
        return;
    }

    // Double-click detection
    if (clickTimeout && lastClickedNode === target) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        lastClickedNode = null;
        // Double-click → open course link
        const course = currentCourses.find(c => c.id === target.id());
        if (course?.course_link) window.open(course.course_link, '_blank');
        return;
    }

    lastClickedNode = target;
    clickTimeout = setTimeout(() => {
        clickTimeout = null;

        // Clicking currently selected node → reset
        if (currentlySelectedNode === target) {
            resetView();
            currentlySelectedNode = null;
            return;
        }

        showNodePrereqPath(target);
    }, DOUBLE_CLICK_DELAY);
}

cy.on('tap', handleNodeClick);

// Cancel click on pan/zoom
cy.on('viewport', () => {
    if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
    lastClickedNode = null;
});

// ── Tooltip ──────────────────────────────────────────────────────────────────
const tooltip = document.getElementById('course-tooltip');
let hoverTimeout = null;

cy.on('mouseover', 'node', (e) => {
    if (isNodeSelected) return;
    if (e.target.hasClass('depth-label')) return;
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
        const node = e.target;
        const course = [...courses_math, ...courses_physics].find(c => c.id === node.id());
        if (!course || !tooltip) return;

        tooltip.querySelector('.tooltip-name').textContent = course.name;
        let info = '';
        if (course.avg_grade) info += `ממוצע: ${course.avg_grade.toFixed(1)}`;
        if (course.type) info += (info ? ' | ' : '') + course.type;
        if (course.last_offered) info += (info ? ' | ' : '') + `הוצע: ${course.last_offered}`;
        // Show depth (prerequisite chain length)
        const depth = node.data('depth');
        if (depth !== undefined) info += (info ? ' | ' : '') + `שלב ${depth === 0 ? 'יסוד' : depth}`;
        tooltip.querySelector('.tooltip-info').textContent = info;

        const rPos = node.renderedPosition();
        const cont = cy.container().getBoundingClientRect();
        tooltip.style.left = (cont.left + rPos.x + 15) + 'px';
        tooltip.style.top = (cont.top + rPos.y - 15) + 'px';
        tooltip.classList.add('visible');
    }, 150);
});

cy.on('mouseout', 'node', () => {
    clearTimeout(hoverTimeout);
    tooltip?.classList.remove('visible');
});

// ── Planning Mode ────────────────────────────────────────────────────────────
function applyPlanningStyles() {
    const available = new Set();
    currentCourses.forEach(c => {
        if (takenCourses.has(c.id)) return;
        if (!c.prereqs?.length || c.prereqs.every(p => takenCourses.has(p))) {
            available.add(c.id);
        }
    });

    cy.nodes().not('.depth-label').forEach(n => {
        const id = n.id();
        if (takenCourses.has(id)) {
            n.style({ 'border-color': '#16a34a', 'border-width': 3, 'opacity': 1, 'background-color': '#dcfce7' });
        } else if (available.has(id)) {
            n.style({ 'border-color': '#4a6fa5', 'border-width': 2, 'opacity': 1 });
        } else {
            n.style({ 'opacity': 0.25 });
        }
    });
}

document.getElementById('togglePlanning')?.addEventListener('click', (e) => {
    planningMode = !planningMode;
    e.target.classList.toggle('btn-active');
    if (planningMode) {
        applyPlanningStyles();
    } else {
        // Restore normal view
        const gradeRange = findGradeRange(currentCourses);
        cy.nodes().forEach(node => {
            const course = currentCourses.find(c => c.id === node.data('id'));
            const isPast = course?.last_offered
                ? parseInt(extractYear(course.last_offered)) < parseInt(CURRENT_YEAR)
                : false;
            const bg = course?.avg_grade
                ? getGradeColor(course.avg_grade, gradeRange.min, gradeRange.max)
                : '#f7f8fa';
            node.style({
                'background-color': bg,
                'border-color': '#546e7a',
                'border-width': 1.5,
                'opacity': 1,
                'border-style': isPast ? 'dashed' : 'solid'
            });
        });
    }
});

// ── Grade Distribution (Right-Click) ─────────────────────────────────────────
function findCourseData(courseId) {
    // Find full course data (with grade_distribution) by name
    for (const [num, info] of Object.entries(rawMathData)) {
        if (info.name === courseId) return info;
    }
    for (const [num, info] of Object.entries(rawPhysicsData)) {
        if (info.name === courseId) return info;
    }
    // Try from processed data
    const processed = [...courses_math, ...courses_physics].find(c => c.id === courseId);
    if (processed?.grade_distribution) return processed;
    return null;
}

function showGradeDistribution(courseId) {
    const data = findCourseData(courseId);
    if (!data || !data.grade_distribution) return;

    // Remove existing
    document.getElementById('grade-distribution-window')?.remove();

    const win = document.createElement('div');
    win.id = 'grade-distribution-window';
    win.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; padding: 20px; border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 1002;
        max-width: 700px; width: 90%; direction: rtl;
    `;

    const ranges = ['0-49', '50-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-100'];
    const dist = {};
    let maxCount = 0, totalStudents = 0;
    ranges.forEach(r => dist[r] = 0);

    if (Array.isArray(data.grade_distribution)) {
        data.grade_distribution.forEach((count, i) => {
            if (i < ranges.length) {
                dist[ranges[i]] = count;
                maxCount = Math.max(maxCount, count);
                totalStudents += count;
            }
        });
    } else if (typeof data.grade_distribution === 'object') {
        Object.entries(data.grade_distribution).forEach(([range, count]) => {
            if (dist.hasOwnProperty(range)) {
                dist[range] = count;
                maxCount = Math.max(maxCount, count);
                totalStudents += count;
            }
        });
    }

    const barsHtml = ranges.map(range => {
        const count = dist[range] || 0;
        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%;">
            <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:4px;">${count}</div>
            <div style="width:100%; height:${pct}%; min-height:${pct > 0 ? '2px' : '0'}; background:#4a6fa5; border-radius:3px 3px 0 0; margin-top:auto;"></div>
            <div style="font-size:10px; color:#666; transform:rotate(-45deg); transform-origin:right top; white-space:nowrap; margin-top:8px;">${range}</div>
        </div>`;
    }).join('');

    const avgText = data.avg_grade ? data.avg_grade.toFixed(2) : 'לא ידוע';

    win.innerHTML = `
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; left:8px; background:none; border:none; font-size:22px; cursor:pointer; color:#666;">×</button>
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:16px;">התפלגות ציונים: ${data.name}</div>
        <div style="display:flex; height:250px; align-items:flex-end; gap:6px; padding:16px; background:#f9f9f9; border:1px solid #eee; border-radius:8px; direction:ltr;">
            ${barsHtml}
        </div>
        <div style="margin-top:12px; text-align:center; color:#666; font-size:13px; padding:10px; background:#f5f5f5; border-radius:4px;">
            סה"כ סטודנטים: ${totalStudents} | ממוצע: ${avgText}
        </div>
    `;

    document.body.appendChild(win);

    // Close on click outside or Escape
    const close = (e) => {
        if (!win.contains(e.target)) { win.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', escClose); }
    };
    const escClose = (e) => {
        if (e.key === 'Escape') { win.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', escClose); }
    };
    win.addEventListener('click', e => e.stopPropagation());
    setTimeout(() => {
        document.addEventListener('click', close);
        document.addEventListener('keydown', escClose);
    }, 100);
}

cy.on('cxttap', 'node', (evt) => {
    evt.preventDefault();
    showGradeDistribution(evt.target.id());
});

cy.on('cxttap', (evt) => { evt.preventDefault(); });

// ── UI Setup ─────────────────────────────────────────────────────────────────
function setupUI() {
    const sidebar = document.getElementById('sidebar');

    document.getElementById('toggleSidebar')?.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
    });

    document.getElementById('closeSidebar')?.addEventListener('click', () => {
        sidebar?.classList.remove('open');
    });

    // Filter change handlers — apply immediately
    ['facultyFilter', 'yearFilter', 'typeFilter', 'evalFilter'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.addEventListener('change', (e) => {
            const filterType = id.replace('Filter', '');
            const selected = Array.from(e.target.selectedOptions).map(o => o.value);

            if (selected.length === 0 || selected.includes('all')) {
                activeFilters[filterType] = new Set(['all']);
                Array.from(e.target.options).forEach(o => { o.selected = o.value === 'all'; });
            } else {
                activeFilters[filterType] = new Set(selected);
                const allOpt = e.target.querySelector('option[value="all"]');
                if (allOpt) allOpt.selected = false;
            }

            if (id === 'facultyFilter') {
                activeFilters.type = new Set(['all']);
                activeFilters.eval = new Set(['all']);
                populateFilterOptions();
            }

            applyFilters();
        });
    });

    // Apply button (redundant but nice to have)
    document.getElementById('applyFilters')?.addEventListener('click', applyFilters);

    // Reset button
    document.getElementById('resetAll')?.addEventListener('click', () => {
        setInitialFilters();
        resetView();
    });
}

// ── Resize Handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', _.debounce(() => cy.fit(30), 250));

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
    try {
        await loadCourseData();
        setupUI();
        populateFilterOptions();
        applyFilters();
        document.getElementById('loadingOverlay')?.classList.add('hidden');
    } catch (error) {
        console.error('Error initializing:', error);
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.innerHTML = `<p style="color:red;">שגיאה בטעינת נתונים</p>`;
    }
});
