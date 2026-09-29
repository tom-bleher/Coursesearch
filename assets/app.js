'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const LEVEL_LABELS = { 1: 'שנה א׳', 2: 'שנה ב׳', 3: 'שנה ג׳', 4: 'מתקדמים ותואר שני' };
const MAIN_TYPES = ['שיעור', 'סמינר', 'מעבדה', 'קריאה מודרכת'];
const OTHER_TYPE = 'אחר';
const GRADE_DOMAIN = [55, 90];           // fixed so colours mean the same in every view
const READABLE_ZOOM = 0.6;               // below this node labels become unreadable
const NODE_W = 160, NODE_H = 50, H_GAP = 24, LINE_GAP = 26, ROW_GAP = 64, BAND_GAP = 40;
const STORAGE_KEY = 'coursesearch_taken', PLAN_KEY = 'coursesearch_plan';
const MOBILE = matchMedia('(max-width: 760px)');  // keep in sync with style.css
const DEFAULTS = { depts: ['מתמטיקה'], types: ['שיעור'], offered: 'current', isolated: false, electives: true };
const HINT_KEY = 'coursesearch_hint_seen', PROGRAM_KEY = 'coursesearch_program';
const UPDATED_KEY = 'coursesearch_updated', SYNCED_KEY = 'coursesearch_synced_uid', START_KEY = 'coursesearch_start';
// Program suggested when switching to program view, by the department being viewed
const DEFAULT_PROGRAMS = {
    'מתמטיקה': 'תוכנית חד-חוגית במתמטיקה במגמת מתמטיקה עיונית',
    'פיזיקה': 'תוכנית חד-חוגית בפיזיקה',
    'מדעי המחשב': 'תוכנית חד-חוגית במדעי המחשב',
};

// ── Small helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat(Infinity).filter(c => c != null && c !== false));
    return el;
}

const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

function hebrewYear(year) {
    const letters = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'],
        [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
        [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
    let n = (year + 3760) % 1000, s = '';
    for (const [value, ch] of letters) {
        if (n === 15 || n === 16) { s += n === 15 ? 'טו' : 'טז'; break; }
        while (n >= value) { s += ch; n -= value; }
    }
    return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`;
}
const semLabel = sem => `${hebrewYear(+sem.slice(0, 4))} ${sem.endsWith('a') ? 'א׳' : 'ב׳'}`;
const formatId = id => `${id.slice(0, 4)}-${id.slice(4)}`;
const level = id => { const d = +id[4]; return d >= 1 && d <= 3 ? d : 4; };
const typeKey = c => (MAIN_TYPES.includes(c.type) ? c.type : OTHER_TYPE);
// The canvas renders right-to-left; pin punctuation in Latin names to their letters with LRM marks
const canvasLabel = name => (/^[^\p{L}]*\p{Script=Latin}/u.test(name)
    ? `\u200E${name.replace(/([^\p{L}\p{N}\s])/gu, '\u200E$1\u200E')}\u200E` : name);
const shortProgram = name => name.replace(/^(תוכנית|תכנית)\s+(לימודים\s+)?/, '');

// ── Requirement trees: "id" | {all: [...]} | {any: [...]} ───────────────────
function reqIds(req) {
    if (!req) return [];
    if (typeof req === 'string') return [req];
    return Object.values(req)[0].flatMap(reqIds);
}

function altIds(req, inAny = false, out = new Set()) {
    if (!req) return out;
    if (typeof req === 'string') { if (inAny) out.add(req); return out; }
    const [kind, items] = Object.entries(req)[0];
    items.forEach(r => altIds(r, inAny || kind === 'any', out));
    return out;
}

function satisfied(req, has) {
    if (!req) return true;
    if (typeof req === 'string') return has(req);
    const [kind, items] = Object.entries(req)[0];
    return kind === 'all' ? items.every(r => satisfied(r, has)) : items.some(r => satisfied(r, has));
}

// ── State ────────────────────────────────────────────────────────────────────
let DATA, COURSES, cy;
let bandModel = [];
const state = {
    depts: new Set(DEFAULTS.depts),
    types: new Set(DEFAULTS.types),
    offered: DEFAULTS.offered,
    isolated: DEFAULTS.isolated,
    electives: DEFAULTS.electives,
    program: '',
    selected: null,
    info: null,                          // program panel: {type: 'program'} | {type: 'category', index}
    start: store.get(START_KEY, '') || '', // catalog year the student started in ('' = current catalog)
    planning: false,
    clickMode: 'taken',                  // planning: a click marks "passed" or adds to the target semester
    target: null,                        // planning: semester being planned
    taken: new Set(store.get(STORAGE_KEY, [])),
    plan: new Map(Object.entries(store.get(PLAN_KEY, {}))),  // course id → semester, e.g. "2027b"
};

function prepare(data) {
    const courses = new Map();
    for (const [id, c] of Object.entries(data.courses)) {
        courses.set(id, {
            id, ...c,
            prereqs: reqIds(c.req), alts: altIds(c.req), coreqs: reqIds(c.coreq), dependents: new Set(),
        });
    }
    for (const c of courses.values()) {
        for (const p of [...c.prereqs, ...c.coreqs]) courses.get(p)?.dependents.add(c.id);
        c.reqT = trackable(c.req, courses);
        c.coreqT = trackable(c.coreq, courses);
    }
    return courses;
}

// Courses outside the dataset can't be marked as passed, so they count as met — but within a
// "one of" group only when the group has no alternative inside the dataset.
function trackable(req, courses) {
    if (!req || typeof req === 'string') return req;
    const [kind, items] = Object.entries(req)[0];
    let kept = items;
    if (kind === 'any') {
        const inData = items.filter(r => reqIds(r).some(id => courses.has(id)));
        if (inData.length) kept = inData;
    }
    kept = kept.map(r => trackable(r, courses));
    return kept.length === 1 ? kept[0] : { [kind]: kept };
}

const courseName = id => COURSES.get(id)?.name ?? DATA.external[id] ?? formatId(id);
const offeredNow = c => (c.semesters || []).some(s => +s.slice(0, 4) === DATA.meta.latest_year);

function isOffered(c, mode) {
    if (mode === 'all') return true;
    const since = DATA.meta.latest_year - (mode === 'recent' ? 2 : 0);
    return (c.semesters || []).some(s => +s.slice(0, 4) >= since);
}

// ── Planning model ───────────────────────────────────────────────────────────
// A course can be taken in semester S once its prerequisites were passed or planned before S;
// co-requisites may also be planned for S itself.
const meets = done => id => done.has(id) || !COURSES.has(id);
const canTake = (c, done) => satisfied(c.reqT, meets(done));
const partName = sem => (sem.endsWith('a') ? 'א׳' : 'ב׳');

function planSemesters() {
    const y = DATA.meta.latest_year;
    return [...new Set([y, y + 1, y + 2].flatMap(v => [`${v}a`, `${v}b`]).concat([...state.plan.values()]))].sort();
}
const plannedIn = sem => [...state.plan].filter(([, s]) => s === sem).map(([id]) => id).sort();
const doneBefore = sem => new Set([...state.taken, ...[...state.plan].filter(([, s]) => s < sem).map(([id]) => id)]);
// Future years are assumed to follow this year's schedule
const offeredInPart = (c, sem) => (c.semesters || []).includes(`${DATA.meta.latest_year}${sem.slice(-1)}`);
const creditsOf = ids => ids.reduce((sum, id) => sum + (COURSES.get(id)?.credits || 0), 0);

// Number of courses still needed to satisfy a requirement tree
function missingCount(req, has) {
    if (!req) return 0;
    if (typeof req === 'string') return has(req) ? 0 : 1;
    const [kind, items] = Object.entries(req)[0];
    const counts = items.map(r => missingCount(r, has));
    return kind === 'all' ? counts.reduce((a, b) => a + b, 0) : Math.min(...counts);
}

// The unmet part of a requirement tree, or null when satisfied
function unmet(req, has) {
    if (!req || satisfied(req, has)) return null;
    if (typeof req === 'string') return req;
    const [kind, items] = Object.entries(req)[0];
    const rest = items.map(r => unmet(r, has)).filter(Boolean);
    return rest.length === 1 ? rest[0] : { [kind]: rest };
}

function reqText(req) {
    if (typeof req === 'string') return courseName(req);
    const [kind, items] = Object.entries(req)[0];
    const text = items.map(r => (typeof r === 'string' ? reqText(r) : `(${reqText(r)})`)).join(kind === 'all' ? ' + ' : ' או ');
    return text;
}

function planIssues(id, sem) {
    const c = COURSES.get(id), done = doneBefore(sem), issues = [];
    const missing = unmet(c.reqT, meets(done));
    if (missing) issues.push(`חסר: ${reqText(missing)}`);
    const withParallel = new Set([...done, ...plannedIn(sem)]);
    const parallel = unmet(c.coreqT, meets(withParallel));
    if (parallel) issues.push(`במקביל: ${reqText(parallel)}`);
    if (!offeredInPart(c, sem)) issues.push(offeredNow(c) ? `לא מוצע בסמסטר ${partName(sem)}` : 'לא מוצע השנה');
    return issues;
}

// ── Views: which courses to show, grouped into horizontal bands ─────────────
function deptView() {
    let ids = [...COURSES.values()]
        .filter(c => state.depts.has(c.dept) && state.types.has(typeKey(c)) && isOffered(c, state.offered))
        .map(c => c.id);
    if (!state.isolated) {
        const visible = new Set(ids);
        ids = ids.filter(id => {
            const c = COURSES.get(id);
            return [...c.prereqs, ...c.coreqs, ...c.dependents].some(n => visible.has(n));
        });
    }
    const byLevel = new Map();
    ids.forEach(id => byLevel.set(level(id), [...(byLevel.get(level(id)) || []), id]));
    const bands = [...byLevel.keys()].sort().map(l => ({ label: LEVEL_LABELS[l], ids: byLevel.get(l) }));
    return { bands, required: new Set(), categories: new Map(), cats: [], program: null };
}

function programView() {
    const program = programEdition(state.program);
    const cats = (program?.categories || [])
        .map((cat, i) => ({ ...cat, i }))
        .sort((a, b) => (a.year ?? 9) - (b.year ?? 9) || b.required - a.required || (a.sem ?? 3) - (b.sem ?? 3) || a.i - b.i);
    const placed = new Set(), required = new Set(), categories = new Map(), bands = [];
    for (const cat of cats) {
        cat.courses.filter(id => COURSES.has(id)).forEach(id => {
            categories.set(id, [...(categories.get(id) || []), cat.name]);
            if (isMandatory(cat)) required.add(id);
        });
        if (!cat.required && !state.electives) continue;
        const ids = cat.courses.filter(id => COURSES.has(id) && !placed.has(id));
        ids.forEach(id => placed.add(id));
        if (!ids.length) continue;
        bands.push({ label: bandLabel(cat), title: cat.name, credits: cat.credits, category: cat.i, ids });
    }
    return { bands, required, categories, cats, program };
}

// A program as described in the catalog of the student's start year (students keep their start-year rules)
function programEdition(name) {
    const p = DATA.plans[name];
    if (!p) return null;
    const edition = state.start && p.previous?.[state.start];
    return edition ? { ...p, ...edition, year: state.start } : { ...p, year: String(DATA.meta.catalog_year) };
}

// "2027b" → "תשפ״ז ב׳ · שנה ב׳" when the student's start year is known
function semOption(sem) {
    if (!state.program) return semLabel(sem);
    const n = +sem.slice(0, 4) - (+(state.start || DATA.meta.catalog_year) + 1) + 1;
    return n >= 1 && n <= 5 ? `${semLabel(sem)} · שנה ${'אבגדה'[n - 1]}׳` : semLabel(sem);
}

const choose = cat => (cat.count && cat.count < cat.courses.length ? cat.count : null);
const isMandatory = cat => cat.required && !choose(cat);

// "שנה ב' - סמסטר א' - קורסי חובה בפיזיקה" → "שנה ב׳ · סמסטר א׳ · חובה"
function bandLabel(cat) {
    if (!cat.year) return cat.name;
    const span = cat.name.match(/שנים\s+([אבגד])'?\s*[-+]\s*([אבגד])/);
    const kind = cat.required ? 'חובה' : /סמינר/.test(cat.name) ? 'סמינר' : /סדנ/.test(cat.name) ? 'סדנה' : 'בחירה';
    const pick = choose(cat) ? ` (${cat.count} מתוך ${cat.courses.length})` : '';
    return [
        span ? `שנים ${span[1]}׳–${span[2]}׳` : `שנה ${'אבגד'[cat.year - 1]}׳`,
        cat.sem && `סמסטר ${'אב'[cat.sem - 1]}׳`,
        kind + pick,
    ].filter(Boolean).join(' · ');
}

const currentView = () => (state.program ? programView() : deptView());

// ── Layout: bands → rows by in-band prerequisite depth → barycentre ordering ─
function layout(view) {
    const rows = [];
    view.bands.forEach((band, b) => {
        const inBand = new Set(band.ids), depth = new Map();
        const d = id => {
            if (depth.has(id)) return depth.get(id);
            depth.set(id, 0);  // cycle guard
            const v = Math.max(0, ...COURSES.get(id).prereqs.filter(p => inBand.has(p)).map(p => d(p) + 1));
            depth.set(id, v);
            return v;
        };
        band.ids.forEach(d);
        const byDepth = new Map();
        band.ids.forEach(id => byDepth.set(depth.get(id), [...(byDepth.get(depth.get(id)) || []), id]));
        [...byDepth.keys()].sort((x, y) => x - y).forEach(k => rows.push({ band: b, ids: byDepth.get(k).sort() }));
    });

    // Order each row by the mean position of its neighbours (a few up/down sweeps)
    const pos = new Map(), rowOf = new Map();
    const setPos = row => row.ids.forEach((id, i) => pos.set(id, (i + 0.5) / row.ids.length));
    rows.forEach((row, r) => { row.ids.forEach(id => rowOf.set(id, r)); setPos(row); });
    const neighbours = id => { const c = COURSES.get(id); return [...c.prereqs, ...c.coreqs, ...c.dependents]; };
    for (let sweep = 0; sweep < 8; sweep++) {
        (sweep % 2 ? [...rows].reverse() : rows).forEach(row => {
            const r = rows.indexOf(row);
            const bary = new Map(row.ids.map(id => {
                const ns = neighbours(id).filter(n => pos.has(n) && rowOf.get(n) !== r);
                return [id, ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : pos.get(id)];
            }));
            row.ids.sort((a, b) => bary.get(a) - bary.get(b));
            setPos(row);
        });
    }

    // Place rows, wrapping long ones onto several lines
    const perLine = MOBILE.matches ? 4 : 10;
    const bandGap = bandGapNow();
    const positions = new Map(), bands = [];
    let y = 0;
    rows.forEach((row, r) => {
        if (r > 0) y += rows[r - 1].band === row.band ? ROW_GAP : ROW_GAP + bandGap;
        const lines = Math.ceil(row.ids.length / perLine);
        const size = Math.ceil(row.ids.length / lines);
        for (let l = 0; l < lines; l++) {
            const line = row.ids.slice(l * size, (l + 1) * size);
            line.forEach((id, i) => positions.set(id, { x: (i - (line.length - 1) / 2) * (NODE_W + H_GAP), y }));
            if (l < lines - 1) y += NODE_H + LINE_GAP;
        }
        const band = bands[row.band] || (bands[row.band] = { ...view.bands[row.band], top: y, bottom: y });
        band.top = Math.min(band.top, y - (lines - 1) * (NODE_H + LINE_GAP));
        band.bottom = y;
        y += NODE_H;
    });
    return { positions, bands: bands.filter(Boolean) };
}

// On narrow screens band labels sit in the gap above each band instead of a side gutter
const bandGapNow = () => (MOBILE.matches ? 120 : BAND_GAP);

// ── Colours ──────────────────────────────────────────────────────────────────
let palette = {};

function readPalette() {
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    palette = {
        text: v('--text'), node: v('--node'), nodeBorder: v('--node-border'), edge: v('--edge'),
        accent: v('--accent'), taken: v('--taken'), takenBg: v('--taken-bg'), open: v('--open'),
        plannedBg: v('--planned-bg'), warn: v('--warn'),
        grades: [v('--grade-low'), v('--grade-mid'), v('--grade-high')].map(rgb),
    };
}

function gradeColor(mean) {
    if (mean == null) return palette.node;
    const t = Math.min(1, Math.max(0, (mean - GRADE_DOMAIN[0]) / (GRADE_DOMAIN[1] - GRADE_DOMAIN[0]))) * 2;
    const [a, b] = t <= 1 ? [palette.grades[0], palette.grades[1]] : [palette.grades[1], palette.grades[2]];
    const f = t <= 1 ? t : t - 1;
    return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * f)).join(',')})`;
}

function graphStyle() {
    return [
        {
            selector: 'node', style: {
                'label': 'data(label)', 'shape': 'round-rectangle', 'width': NODE_W, 'height': NODE_H,
                'background-color': 'data(color)', 'border-width': 1.2, 'border-color': palette.nodeBorder,
                'color': palette.text, 'font-family': 'Heebo, system-ui, sans-serif', 'font-size': 11.5,
                'font-weight': 500, 'text-wrap': 'wrap', 'text-max-width': NODE_W - 16,
                'text-valign': 'center', 'text-halign': 'center',
                'transition-property': 'opacity', 'transition-duration': '150ms',
            },
        },
        { selector: 'node.past', style: { 'border-style': 'dashed' } },
        { selector: 'node.required', style: { 'border-width': 2.2, 'font-weight': 700 } },
        {
            selector: 'edge', style: {
                'width': 1.4, 'line-color': palette.edge, 'target-arrow-color': palette.edge,
                'target-arrow-shape': 'triangle', 'arrow-scale': 0.9, 'curve-style': 'bezier', 'opacity': 0.55,
            },
        },
        { selector: 'edge.alt', style: { 'line-style': 'dotted', 'width': 1.6 } },
        { selector: 'edge.coreq', style: { 'line-style': 'dashed', 'target-arrow-shape': 'none', 'opacity': 0.45 } },
        { selector: '.faded', style: { 'opacity': 0.12 } },
        { selector: 'edge.hl', style: { 'line-color': palette.accent, 'target-arrow-color': palette.accent, 'opacity': 1, 'width': 2.2 } },
        { selector: 'node.hl', style: { 'border-color': palette.accent, 'border-width': 2 } },
        { selector: 'node.focus', style: { 'border-color': palette.accent, 'border-width': 4 } },
        { selector: 'node.taken', style: { 'background-color': palette.takenBg, 'border-color': palette.taken, 'border-width': 2.5 } },
        { selector: 'node.open', style: { 'border-color': palette.open, 'border-width': 3 } },
        { selector: 'node.planned', style: { 'background-color': palette.plannedBg, 'border-color': palette.open, 'border-width': 2.5 } },
        { selector: 'node.invalid', style: { 'border-color': palette.warn, 'border-style': 'double', 'border-width': 4 } },
        { selector: 'node.locked', style: { 'opacity': 0.3 } },
    ];
}

// ── Rendering ────────────────────────────────────────────────────────────────
let view = null;

const nodeLabel = id => canvasLabel(COURSES.get(id).name)
    + (state.planning && state.plan.has(id) ? `\n${semLabel(state.plan.get(id))}` : '');

function render({ fit = true } = {}) {
    view = currentView();
    const { positions, bands } = layout(view);
    const elements = [], seen = new Set();
    for (const [id, position] of positions) {
        const c = COURSES.get(id);
        elements.push({
            group: 'nodes', data: { id, label: nodeLabel(id), color: gradeColor(c.grades?.mean) }, position,
            classes: [offeredNow(c) ? '' : 'past', view.required.has(id) ? 'required' : ''].join(' '),
        });
        const edge = (source, kind) => {
            const key = [source, id].sort().join('|');
            if (!positions.has(source) || seen.has(key)) return;
            seen.add(key);
            elements.push({ group: 'edges', data: { id: `${source}>${id}`, source, target: id }, classes: kind });
        };
        c.prereqs.forEach(p => edge(p, c.alts.has(p) ? 'alt' : 'prereq'));
        c.coreqs.forEach(p => edge(p, 'coreq'));
    }
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    bandModel = bands;
    applyHighlight();
    drawBands();
    renderPlanner();
    if (fit) fitGraph(cy.nodes());
    renderChrome();
}

// Fit nodes into the part of the viewport not covered by band labels (right) or the details panel
function fitGraph(eles, animate = false) {
    if (!eles.length) return;
    const pad = 32, mobile = MOBILE.matches;
    const panel = [$('details'), $('planner'), $('filters')].find(p => !p.hidden) || { hidden: true };
    const labels = [...document.querySelectorAll('.band-label')].map(l => l.offsetWidth);
    const gutter = mobile ? 0 : Math.min(Math.max(0, ...labels) + 24, cy.width() * 0.3);
    const top = pad + (mobile && bandModel.length ? 34 : 0);  // room for the first band's label
    const left = pad + (!panel.hidden && !mobile ? panel.offsetWidth + 12 : 0);
    const bottom = pad + (!panel.hidden && mobile ? panel.offsetHeight + 8 : 0);
    const w = Math.max(80, cy.width() - left - pad - gutter), hgt = Math.max(80, cy.height() - top - bottom);
    const bb = eles.boundingBox();
    // Tall graphs: rather than shrinking past readability, fit the width and start at the top
    const zoom = Math.min(1.3, w / bb.w, Math.max(hgt / bb.h, READABLE_ZOOM));
    const x = left + (w - bb.w * zoom) / 2, y = top + Math.max(0, (hgt - bb.h * zoom) / 2);
    const pan = { x: x - bb.x1 * zoom, y: y - bb.y1 * zoom };
    if (animate) cy.animate({ zoom, pan, duration: 350 });
    else cy.viewport({ zoom, pan });
}

function drawBands() {
    const container = $('bands');
    const zoom = cy.zoom(), pan = cy.pan(), gap = bandGapNow();
    container.replaceChildren(...bandModel.map(b => {
        const top = (b.top - NODE_H / 2) * zoom + pan.y - (MOBILE.matches ? 34 : (gap / 2 - 4) * zoom);
        const bottom = (b.bottom + NODE_H / 2 + gap / 2 - 4) * zoom + pan.y;
        const label = b.category == null
            ? h('span', { class: 'band-label' }, b.label)
            : h('button', { class: 'band-label', title: `${b.title} · לחצו לפרטים`, onclick: () => showInfo({ type: 'category', index: b.category }) },
                b.label, b.credits && h('span', { class: 'credits' }, `${b.credits} ש״ס`));
        const el = h('div', { class: 'band' }, label);
        el.style.top = `${top}px`;
        el.style.height = `${Math.max(0, bottom - top)}px`;
        return el;
    }));
}

function applyHighlight() {
    cy.batch(() => {
        cy.elements().removeClass('faded hl focus taken open locked planned invalid');
        cy.nodes().forEach(n => n.data('label', nodeLabel(n.id())));
        if (state.planning) {
            const done = doneBefore(state.target);
            cy.nodes().forEach(n => {
                const id = n.id(), c = COURSES.get(id);
                if (state.taken.has(id)) n.addClass('taken');
                else if (state.plan.has(id)) n.addClass(planIssues(id, state.plan.get(id)).length ? 'planned invalid' : 'planned');
                else n.addClass(canTake(c, done) && offeredInPart(c, state.target) ? 'open' : 'locked');
            });
            return;
        }
        const node = state.selected && cy.getElementById(state.selected);
        if (!node || !node.length) return;
        const related = relatedCourses(state.selected);
        cy.nodes().forEach(n => n.addClass(related.has(n.id()) ? 'hl' : 'faded'));
        cy.edges().forEach(e => e.addClass(related.has(e.source().id()) && related.has(e.target().id()) ? 'hl' : 'faded'));
        node.removeClass('hl').addClass('focus');
    });
}

// Full prerequisite chain, direct co-requisites and the courses it directly unlocks
function relatedCourses(id) {
    const out = new Set([id]);
    const walk = cid => {
        const c = COURSES.get(cid);
        if (!c) return;
        c.prereqs.forEach(p => { if (!out.has(p)) { out.add(p); walk(p); } });
    };
    walk(id);
    const c = COURSES.get(id);
    c.coreqs.forEach(p => out.add(p));
    c.dependents.forEach(d => out.add(d));
    return out;
}

// ── Selection & details panel ────────────────────────────────────────────────
function select(id, { focus = false } = {}) {
    if (state.planning) { if (id) focusNode(id); return; }
    state.selected = id && COURSES.has(id) ? id : null;
    if (!state.selected) state.info = null;
    applyHighlight();
    renderDetails();
    if (state.selected) {
        $('filters').hidden = true;
        $('filtersBtn').setAttribute('aria-expanded', 'false');
    }
    const node = state.selected && cy.getElementById(state.selected);
    if (focus && node?.length) {
        const eles = cy.nodes().filter(n => relatedCourses(state.selected).has(n.id()));
        fitGraph(eles, true);
    }
    writeHash();
}

function focusNode(id) {
    const node = cy.getElementById(id);
    if (!node.length) return;
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.9), duration: 300 });
    node.flashClass('focus', 1500);
}

function courseButton(id) {
    const inData = COURSES.has(id);
    return h('span', {},
        inData
            ? h('button', { class: `course-link${state.taken.has(id) ? ' done' : state.plan.has(id) ? ' planned' : ''}`, onclick: () => select(id, { focus: true }) }, courseName(id))
            : h('span', {}, courseName(id)),
        ' ', h('span', { class: 'course-id' }, formatId(id)));
}

function reqList(req) {
    if (typeof req === 'string') return h('ul', { class: 'req' }, h('li', {}, courseButton(req)));
    const [kind, items] = Object.entries(req)[0];
    return h('ul', { class: 'req' },
        kind === 'any' ? h('li', { class: 'req-head' }, 'אחד מהבאים:') : null,
        items.map(r => h('li', {}, typeof r === 'string' ? courseButton(r) : reqList(r))));
}

function histogram(g) {
    const max = Math.max(...g.dist, 1);
    return [
        h('div', { class: 'hist', role: 'img', 'aria-label': 'התפלגות ציונים' },
            g.dist.map(n => {
                const bar = h('div', { class: 'bar', title: n }, h('span', {}, n || ''));
                bar.style.height = `${(n / max) * 100}%`;
                return bar;
            })),
        h('div', { class: 'hist-axis' }, DATA.meta.grade_bins.map(b => h('span', {}, b))),
    ];
}

function statBox(value, label, swatch) {
    const sw = swatch && h('span', { class: 'swatch' });
    if (sw) sw.style.background = swatch;
    return h('div', { class: 'stat' }, h('b', {}, sw, String(value)), h('span', {}, label));
}

function renderDetails() {
    const panel = $('details');
    const c = state.selected && COURSES.get(state.selected);
    if (!c) {
        if (state.info && view.program && !state.planning) renderProgramInfo();
        else panel.hidden = true;
        syncPanels();
        return;
    }

    const latest = DATA.meta.latest_year;
    const thisYear = (c.semesters || []).filter(s => +s.slice(0, 4) === latest).map(s => (s.endsWith('a') ? 'א׳' : 'ב׳')).reverse();
    const lastSem = c.semesters?.[0] || c.last;
    const drishot = lastSem && `https://www.ims.tau.ac.il/Tal/kr/Drishot_L.aspx?kurs=${c.id}&sem=${+lastSem.slice(0, 4) - 1}${lastSem.endsWith('a') ? 1 : 2}`;
    const inGraph = cy.getElementById(c.id).length > 0;
    const dependents = [...c.dependents].sort();
    const cats = view.categories.get(c.id);
    const g = c.grades;

    $('detailsBody').replaceChildren(h('div', {},
        h('h2', {}, c.name),
        h('div', { class: 'meta' },
            h('span', { class: 'tag' }, formatId(c.id)),
            c.dept && h('span', { class: 'tag' }, c.dept),
            c.type && h('span', { class: 'tag' }, c.type),
            view.required.has(c.id) && h('span', { class: 'tag' }, 'חובה בתוכנית')),
        h('div', { class: 'stats' },
            statBox(g ? g.mean.toFixed(1) : '—', 'ממוצע ציון סופי', g && gradeColor(g.mean)),
            statBox(c.credits > 0 ? c.credits : '—', 'ש״ס'),
            thisYear.length
                ? statBox(thisYear.join(' + '), `סמסטר ב${hebrewYear(latest)}`)
                : statBox('—', c.last ? `לא מוצע השנה · לאחרונה ${semLabel(c.last)}` : 'לא מוצע השנה')),
        !inGraph && h('p', { class: 'muted', style: 'margin-top:10px' }, 'הקורס אינו מוצג בגרף עם המסננים הנוכחיים.'),
        cats && [h('h3', {}, 'בתוכנית'), h('p', {}, cats.join(' · '))],
        c.lecturers?.length > 0 && [h('h3', {}, 'מרצים'), h('p', {}, c.lecturers.join(', '))],
        c.exams?.length > 0 && [h('h3', {}, 'הערכה'), h('p', {}, c.exams.join(', '))],
        [h('h3', {}, 'דרישות קדם'), c.req ? reqList(c.req) : h('p', { class: 'muted' }, 'אין')],
        c.coreq && [h('h3', {}, 'דרישות מקבילות'), reqList(c.coreq)],
        dependents.length > 0 && [h('h3', {}, `פותח את (${dependents.length})`), h('ul', { class: 'req' }, dependents.map(id => h('li', {}, courseButton(id))))],
        g ? [
            h('h3', {}, 'ציון סופי'),
            h('p', {}, h('b', {}, g.mean.toFixed(1)), ` ממוצע · ${g.n.toLocaleString('he-IL')} סטודנטים · ${semLabel(g.by_sem[0][0])}–${semLabel(g.by_sem.at(-1)[0])}`),
            histogram(g),
            g.by_sem.length > 1 && h('ul', { class: 'trend' }, g.by_sem.slice().reverse().map(([s, m, n]) =>
                h('li', { title: `${n} סטודנטים` }, `${semLabel(s)}: `, h('b', {}, m.toFixed(1))))),
        ] : [h('h3', {}, 'ציונים'), h('p', { class: 'muted' }, 'אין נתוני ציונים בחמש השנים האחרונות')],
        h('h3', {}, 'תכנון'),
        state.taken.size > 0 && !state.taken.has(c.id) && h('p', { class: canTake(c, state.taken) ? 'ok' : 'warn' },
            canTake(c, state.taken) ? '✓ עמדת בדרישות הקדם' : `חסר: ${reqText(unmet(c.reqT, meets(state.taken)))}`),
        h('div', { class: 'plan-row' },
            h('label', { class: 'check' },
                h('input', { type: 'checkbox', checked: state.taken.has(c.id), onchange: () => toggleTaken(c.id) }),
                h('span', {}, 'עברתי')),
            h('label', { class: 'check' }, h('span', {}, 'מתוכנן ל־'),
                h('select', { onchange: e => setPlan(c.id, e.target.value || null) },
                    h('option', { value: '' }, '—'),
                    planSemesters().map(s => h('option', { value: s, selected: state.plan.get(c.id) === s }, semOption(s)))))),
        state.plan.has(c.id) && planIssues(c.id, state.plan.get(c.id)).map(t => h('p', { class: 'warn' }, `⚠ ${t}`)),
        h('div', { class: 'links' },
            c.syllabus && h('a', { href: c.syllabus, target: '_blank', rel: 'noopener' }, 'סילבוס'),
            drishot && h('a', { href: drishot, target: '_blank', rel: 'noopener' }, 'דרישות באתר האוניברסיטה')),
    ));
    panel.hidden = false;
    panel.scrollTop = 0;
    syncPanels();
}

// ── Program & category info ─────────────────────────────────────────────────
function showInfo(info) {
    if (state.planning) setPlanning(false);
    state.selected = null;
    state.info = info;
    $('filters').hidden = true;
    $('filtersBtn').setAttribute('aria-expanded', 'false');
    applyHighlight();
    renderDetails();
    const ids = info.type === 'category' ? new Set(view.cats.find(c => c.i === info.index)?.courses || []) : null;
    const eles = ids ? cy.nodes().filter(n => ids.has(n.id())) : cy.nodes();
    if (eles.length) fitGraph(eles, true);
    writeHash();
}

const statusMark = id => (state.taken.has(id) ? ' ✓' : state.plan.has(id) ? ' ◷' : '');

function renderProgramInfo() {
    const p = view.program, info = state.info;
    const creditsTag = cat => cat.credits && h('span', { class: 'sub' }, `${cat.credits} ש״ס`);
    let body;
    if (info.type === 'category') {
        const cat = view.cats.find(c => c.i === info.index);
        if (!cat) { state.info = null; $('details').hidden = true; return; }
        const pick = choose(cat);
        body = [
            h('h2', {}, bandLabel(cat)),
            h('p', { class: 'muted' }, cat.name),
            h('div', { class: 'stats' },
                statBox(cat.credits || '—', 'ש״ס נדרשות'),
                statBox(pick ? `${pick}/${cat.courses.length}` : cat.courses.length, pick ? 'קורסים לבחירה' : 'קורסים'),
                statBox(cat.required ? 'חובה' : 'בחירה', 'סוג')),
            cat.note && h('div', { class: 'note' }, cat.note),
            h('h3', {}, 'קורסים'),
            h('ul', { class: 'req' }, cat.courses.filter(id => COURSES.has(id)).map(id => h('li', {}, courseButton(id)))),
            h('div', { class: 'links' }, h('button', { class: 'btn btn-quiet', onclick: () => showInfo({ type: 'program' }) }, 'לכל התוכנית')),
        ];
    } else {
        body = [
            h('h2', {}, shortProgram(state.program)),
            h('div', { class: 'meta' },
                p.degree && h('span', { class: 'tag' }, p.degree),
                h('span', { class: 'tag' }, `ידיעון ${hebrewYear(+p.year + 1)}`)),
            p.total && h('div', { class: 'stats' },
                statBox(p.total, 'ש״ס לתואר'),
                statBox(p.categories.filter(isMandatory).reduce((n, c) => n + c.courses.length, 0), 'קורסי חובה'),
                statBox(p.categories.filter(c => !isMandatory(c)).length, 'אשכולות בחירה')),
            p.parts?.length > 0 && [
                h('p', { class: 'note' }, 'תוכנית זו מורכבת משני חוגים. הכללים המלאים מופיעים בידיעון של כל חוג:'),
                h('ul', { class: 'req' }, p.parts.map(x => h('li', {},
                    DATA.plans[x.name] ? h('button', { class: 'course-link', onclick: () => setProgram(x.name) }, shortProgram(x.name)) : shortProgram(x.name)))),
            ],
            p.about && h('details', { class: 'about' }, h('summary', {}, 'על התוכנית'), h('div', { class: 'note' }, p.about)),
            p.sections?.length > 0 && [
                h('h3', {}, 'מבנה התואר'),
                h('ul', { class: 'section-list' }, p.sections.map(sec => h('li', {},
                    h('div', { class: 'row' }, h('b', {}, sec.name),
                        h('span', { class: 'sub' }, sec.credits && `${sec.credits} ש״ס`,
                            sec.schedule && [' · ', h('a', { href: sec.schedule, target: '_blank', rel: 'noopener' }, 'מערכת שעות')])),
                    sec.note && h('div', { class: 'note' }, sec.note)))),
            ],
            h('h3', {}, 'חלקי התוכנית'),
            h('ul', { class: 'section-list' }, view.cats.map(cat => h('li', {},
                h('div', { class: 'row' },
                    h('button', { class: 'course-link', onclick: () => showInfo({ type: 'category', index: cat.i }) }, bandLabel(cat)),
                    creditsTag(cat))))),
            h('div', { class: 'links' },
                p.url && h('a', { href: p.url, target: '_blank', rel: 'noopener' }, 'הידיעון הרשמי'),
                (p.links || []).map(l => h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.title))),
        ];
    }
    $('detailsBody').replaceChildren(h('div', {}, body));
    $('details').hidden = false;
    $('details').scrollTop = 0;
}

// Track whether a side panel is open (canvas tools move out of its way)
function syncPanels() {
    document.body.classList.toggle('panel-open', ['details', 'planner', 'filters'].some(id => !$(id).hidden));
}

// ── Planning ─────────────────────────────────────────────────────────────────
function saveProgress() {
    store.set(STORAGE_KEY, [...state.taken]);
    store.set(PLAN_KEY, Object.fromEntries(state.plan));
    store.set(UPDATED_KEY, Date.now());
    pushSoon();
    refreshProgress();
}

function refreshProgress() {
    applyHighlight();
    renderPlanner();
    renderDetails();
    renderChrome();
}

function toggleTaken(id) {
    if (state.taken.delete(id)) return saveProgress();
    state.taken.add(id);
    state.plan.delete(id);
    saveProgress();
}

function setPlan(id, sem) {
    if (sem) { state.plan.set(id, sem); state.taken.delete(id); } else state.plan.delete(id);
    saveProgress();
}

function clearProgress() {
    if (!confirm('למחוק את כל הקורסים שסימנת ותכננת?')) return;
    state.taken.clear();
    state.plan.clear();
    saveProgress();
}

function setPlanning(on) {
    state.planning = on;
    if (on) {
        state.selected = null;
        state.info = null;
        $('details').hidden = true;
        $('filters').hidden = true;
        $('filtersBtn').setAttribute('aria-expanded', 'false');
    }
    applyHighlight();
    renderPlanner();
    renderChrome();
    writeHash();
}

function planItem(c, extra, action) {
    return h('li', { class: 'plan-item' },
        h('div', {},
            h('button', { class: 'course-link', onclick: () => focusNode(c.id) }, c.name),
            h('div', { class: 'sub' }, [formatId(c.id), c.credits > 0 && `${c.credits} ש״ס`,
                view.required.has(c.id) && 'חובה בתוכנית'].filter(Boolean).join(' · ')),
            extra),
        action);
}

function renderPlanner() {
    const panel = $('planner');
    if (!state.planning || !$('filters').hidden) { panel.hidden = true; syncPanels(); return; }

    const target = state.target, targetName = semLabel(target);
    const done = doneBefore(target), has = meets(done);
    const rank = c => (view.required.has(c.id) ? 0 : 10) + level(c.id);
    const order = (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id);
    const candidates = cy.nodes().map(n => COURSES.get(n.id()))
        .filter(c => !state.taken.has(c.id) && !state.plan.has(c.id) && offeredInPart(c, target));
    const available = candidates.filter(c => canTake(c, done)).sort(order);
    const almost = candidates.filter(c => !canTake(c, done) && missingCount(c.reqT, has) === 1).sort(order);
    const planned = [...state.plan.keys()];
    const addButton = c => h('button', { class: 'btn btn-small', title: `הוספה ל${targetName}`, 'aria-label': `הוספת ${c.name} ל${targetName}`,
        onclick: () => setPlan(c.id, target) }, '+');

    $('plannerBody').replaceChildren(h('div', {},
        h('h2', {}, 'תכנון לימודים'),
        h('p', { class: 'muted' }, 'סמנו קורסים שעברתם ובנו תוכנית קדימה. קורס נפתח כשכל דרישות הקדם שלו הושלמו או תוכננו לסמסטר מוקדם יותר.'),
        h('div', { class: 'meta' },
            h('span', { class: 'tag' }, `עברתי: ${state.taken.size} קורסים · ${creditsOf([...state.taken])} ש״ס`),
            h('span', { class: 'tag' }, `מתוכננים: ${planned.length} · ${creditsOf(planned)} ש״ס`)),
        h('div', { class: 'plan-controls' },
            h('label', { class: 'field' }, h('span', {}, 'סמסטר יעד'),
                h('select', { id: 'target', onchange: e => { state.target = e.target.value; saveProgress(); } },
                    planSemesters().map(s => h('option', { value: s, selected: s === target }, semOption(s))))),
            h('div', { class: 'field' }, h('span', {}, 'לחיצה על קורס בגרף'),
                h('div', { class: 'chips' },
                    chip('מסמנת שעברתי', state.clickMode === 'taken', () => { state.clickMode = 'taken'; renderPlanner(); }),
                    chip(`מוסיפה ל${targetName}`, state.clickMode === 'plan', () => { state.clickMode = 'plan'; renderPlanner(); })))),

        h('h3', {}, `אפשר לקחת ב${targetName} (${available.length})`),
        available.length
            ? h('ul', { class: 'plan-list', id: 'available' }, available.map(c => planItem(c, null, addButton(c))))
            : h('p', { class: 'muted' }, 'אין קורסים זמינים בתצוגה הנוכחית.'),

        almost.length > 0 && [
            h('h3', {}, `חסר קורס אחד (${almost.length})`),
            h('ul', { class: 'plan-list', id: 'almost' }, almost.map(c =>
                planItem(c, h('div', { class: 'sub warn' }, `חסר: ${reqText(unmet(c.reqT, has))}`)))),
        ],

        h('h3', {}, 'התוכנית שלי'),
        planned.length
            ? planSemesters().filter(s => plannedIn(s).length).map(s => h('div', { class: 'plan-sem' },
                h('div', { class: 'plan-sem-head' }, h('b', {}, semLabel(s)), ` · ${plannedIn(s).length} קורסים · ${creditsOf(plannedIn(s))} ש״ס`),
                h('ul', { class: 'plan-list' }, plannedIn(s).filter(id => COURSES.has(id)).map(id => {
                    const issues = planIssues(id, s);
                    return planItem(COURSES.get(id), issues.length > 0 && h('div', { class: 'sub warn' }, `⚠ ${issues.join(' · ')}`),
                        h('button', { class: 'btn btn-small', 'aria-label': 'הסרה מהתוכנית', onclick: () => setPlan(id, null) }, '×'));
                }))))
            : h('p', { class: 'muted' }, 'עדיין לא תוכננו קורסים. בחרו סמסטר יעד והוסיפו קורסים מהרשימה או מהגרף.'),

        view.cats.length > 0 && programProgress(),
        (state.taken.size > 0 || planned.length > 0) && h('button', { class: 'btn btn-quiet', onclick: clearProgress }, 'ניקוי הכל'),
        h('p', { class: 'muted small' }, 'ההיצע בשנים הבאות משוער לפי מערכת השעות של השנה. הרשימות מתייחסות לקורסים שבתצוגה.'),
    ));
    panel.hidden = false;
    syncPanels();
}

function programProgress() {
    const creditsIn = (ids, set) => ids.filter(id => set.has(id)).reduce((n, id) => n + (COURSES.get(id)?.credits || 0), 0);
    const plannedSet = new Set(state.plan.keys());
    const meter = (done, planned, need) => {
        const bar = h('div', { class: 'meter' }, h('i', { class: 'done' }), h('i', { class: 'planned' }));
        bar.children[0].style.width = `${Math.min(100, (done / need) * 100)}%`;
        bar.children[1].style.width = `${Math.min(100 - Math.min(100, (done / need) * 100), (planned / need) * 100)}%`;
        return bar;
    };
    const total = view.program?.total;
    const allIds = [...new Set(view.cats.flatMap(c => c.courses))];
    const doneAll = creditsOf([...state.taken]), plannedAll = creditsOf([...plannedSet]);
    return [
        h('h3', {}, 'התקדמות בתוכנית'),
        total && h('div', { class: 'progress' },
            h('div', { class: 'progress-top' }, h('b', {}, 'סה״כ לתואר'),
                h('span', { class: 'sub' }, `${doneAll}${plannedAll ? ` + ${plannedAll}` : ''} / ${total} ש״ס`)),
            meter(doneAll, plannedAll, total)),
        h('ul', { class: 'plan-list' }, view.cats.map(cat => {
            const need = Number(String(cat.credits || '').split('-')[0]) || 0;
            const done = creditsIn(cat.courses, state.taken), planned = creditsIn(cat.courses, plannedSet);
            return h('li', { class: 'progress' },
                h('div', { class: 'progress-top' },
                    h('button', { class: 'course-link', title: cat.name, onclick: () => showInfo({ type: 'category', index: cat.i }) }, bandLabel(cat)),
                    h('span', { class: `sub${need && done >= need ? ' ok' : ''}` },
                        need ? `${done}${planned ? ` + ${planned}` : ''} / ${need} ש״ס` : `${done + planned} ש״ס`)),
                need > 0 && meter(done, planned, need));
        })),
        allIds.length === 0 && h('p', { class: 'muted' }, 'אין נתונים'),
    ];
}

// ── Cloud sync (enabled when assets/firebase-config.js provides a Firebase config) ──
const cloud = { api: null, user: null, timer: null, status: '' };

function localProgress() {
    return {
        taken: [...state.taken], plan: Object.fromEntries(state.plan),
        program: store.get(PROGRAM_KEY, '') || '', start: state.start, updatedAt: store.get(UPDATED_KEY, 0),
    };
}

// First sync of a device with an account: union of passed courses; the newer side wins planned conflicts
function mergeProgress(local, remote) {
    const [older, newer] = (remote.updatedAt || 0) > (local.updatedAt || 0) ? [local, remote] : [remote, local];
    const taken = [...new Set([...(local.taken || []), ...(remote.taken || [])])];
    const plan = Object.fromEntries(Object.entries({ ...(older.plan || {}), ...(newer.plan || {}) })
        .filter(([id]) => !taken.includes(id)));
    return { taken, plan, program: newer.program || older.program || '', start: newer.start || older.start || '', updatedAt: Date.now() };
}

function applyProgress(p) {
    state.taken = new Set((p.taken || []).filter(id => COURSES.has(id)));
    state.plan = new Map(Object.entries(p.plan || {}).filter(([id]) => COURSES.has(id) && !state.taken.has(id)));
    store.set(STORAGE_KEY, [...state.taken]);
    store.set(PLAN_KEY, Object.fromEntries(state.plan));
    store.set(PROGRAM_KEY, p.program || '');
    state.start = /^\d{4}$/.test(p.start || '') ? p.start : '';
    store.set(START_KEY, state.start);
    store.set(UPDATED_KEY, p.updatedAt || 0);
    refreshProgress();
}

function setSyncStatus(text) {
    cloud.status = text;
    renderAccount();
}

function pushSoon() {
    if (!cloud.user) return;
    clearTimeout(cloud.timer);
    setSyncStatus('שומר…');
    cloud.timer = setTimeout(async () => {
        try {
            await cloud.api.save(localProgress());
            setSyncStatus('מסונכרן');
        } catch (err) {
            console.error(err);
            setSyncStatus('שגיאת סנכרון');
        }
    }, 800);
}

async function onCloudUser(user) {
    cloud.user = user;
    renderAccount();
    if (!user) return;
    try {
        setSyncStatus('מסנכרן…');
        const remote = await cloud.api.load(), local = localProgress();
        if (!remote) {
            await cloud.api.save({ ...local, updatedAt: local.updatedAt || Date.now() });
        } else if (store.get(SYNCED_KEY, null) !== user.uid) {
            const merged = mergeProgress(local, remote);
            applyProgress(merged);
            await cloud.api.save(merged);
        } else if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
            applyProgress(remote);
        } else {
            await cloud.api.save(local);
        }
        store.set(SYNCED_KEY, user.uid);
        setSyncStatus('מסונכרן');
    } catch (err) {
        console.error(err);
        setSyncStatus('שגיאת סנכרון');
    }
}

// Signing out leaves nothing behind on shared computers; the progress stays in the account
async function cloudSignOut({ deleteData = false } = {}) {
    if (deleteData && !confirm('למחוק את נתוני התכנון שלך מהענן? לא ניתן לשחזר.')) return;
    $('accountMenu').hidden = true;
    try {
        if (deleteData) await cloud.api.remove();
        await cloud.api.signOut();
    } catch (err) {
        console.error(err);
        alert('הפעולה נכשלה. נסו שוב.');
        return;
    }
    store.set(SYNCED_KEY, null);
    applyProgress({ taken: [], plan: {}, program: '', updatedAt: 0 });
}

function renderAccount() {
    const btn = $('accountBtn');
    if (!cloud.api) return;
    btn.hidden = false;
    const u = cloud.user;
    const avatar = u?.photo ? h('img', { src: u.photo, alt: '', class: 'avatar', referrerpolicy: 'no-referrer' })
        : u && h('span', { class: 'avatar' }, (u.name || u.email || '?')[0]);
    btn.replaceChildren(...(u ? [avatar, h('span', { class: 'account-name' }, (u.name || u.email || '').split(' ')[0])]
        : [googleIcon(), h('span', {}, 'התחברות')]));
    btn.title = u ? `${u.name || ''} · ${cloud.status}` : 'התחברות עם Google לשמירת התכנון בכל מכשיר';
    $('accountMenu').replaceChildren(...(u ? [
        h('div', { class: 'account-who' }, h('b', {}, u.name || ''), h('div', { class: 'muted small' }, u.email || '')),
        h('p', { class: 'small' }, `התכנון נשמר בחשבון · ${cloud.status}`),
        h('button', { class: 'btn btn-quiet', onclick: () => cloudSignOut() }, 'התנתקות'),
        h('button', { class: 'btn btn-quiet warn', onclick: () => cloudSignOut({ deleteData: true }) }, 'מחיקת הנתונים מהענן'),
    ] : []));
}

function googleIcon() {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'icon google');
    [['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
     ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
     ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
     ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z']]
        .forEach(([fill, d]) => { const path = document.createElementNS(ns, 'path'); path.setAttribute('fill', fill); path.setAttribute('d', d); svg.append(path); });
    return svg;
}

async function setupCloud() {
    if (!window.FIREBASE_CONFIG) return;
    try {
        const { createCloud } = await import('./sync.js');
        cloud.api = createCloud(window.FIREBASE_CONFIG, onCloudUser);
    } catch (err) {
        console.error('Cloud sync unavailable', err);
        return;
    }
    renderAccount();
    $('accountBtn').addEventListener('click', async () => {
        if (cloud.user) { $('accountMenu').hidden = !$('accountMenu').hidden; return; }
        try {
            await cloud.api.signIn();
        } catch (err) {
            if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
                console.error(err);
                alert('ההתחברות נכשלה. נסו שוב.');
            }
        }
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('#accountMenu, #accountBtn')) $('accountMenu').hidden = true;
    });
}

// ── Search ───────────────────────────────────────────────────────────────────
function setupSearch() {
    const input = $('search'), list = $('searchResults');
    let results = [], active = -1;

    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    const choose = id => { close(); input.value = ''; input.blur(); select(id, { focus: true }); };
    const paint = () => [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));

    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        const digits = term.replace(/\D/g, '');
        if (!term) return close();
        const score = c => (c.name.toLowerCase().startsWith(term) ? 0 : 1) + (cy.getElementById(c.id).length ? 0 : 2);
        results = [...COURSES.values()]
            .filter(c => c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.id.includes(digits)))
            .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
            .slice(0, 12);
        active = results.length ? 0 : -1;
        list.replaceChildren(...(results.length
            ? results.map(c => h('li', { role: 'option', onmousedown: e => { e.preventDefault(); choose(c.id); } },
                h('div', {}, c.name),
                h('div', { class: 'sub' }, [formatId(c.id), c.dept, c.grades && `ממוצע ${c.grades.mean.toFixed(1)}`].filter(Boolean).join(' · '))))
            : [h('li', { class: 'sub' }, 'לא נמצאו קורסים')]));
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        paint();
    });
    input.addEventListener('keydown', e => {
        if (list.hidden) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1);
            paint();
        } else if (e.key === 'Enter' && results[active]) {
            choose(results[active].id);
        } else if (e.key === 'Escape') {
            close();
        }
    });
    input.addEventListener('blur', close);
}

// ── Filters & header ─────────────────────────────────────────────────────────
function chip(label, pressed, onclick, count) {
    return h('button', { class: 'chip', 'aria-pressed': String(pressed), onclick },
        label, count != null && h('span', { class: 'count' }, ` ${count}`));
}

function toggleIn(set, value) {
    set.has(value) ? set.delete(value) : set.add(value);
}

function renderChrome() {
    const inProgram = Boolean(state.program);
    document.title = `${inProgram ? shortProgram(state.program) : [...state.depts].join(', ') || 'עץ הקורסים'} · עץ הקורסים`;
    document.body.classList.toggle('program', inProgram);
    $('modeDept').setAttribute('aria-pressed', String(!inProgram));
    $('modeProgram').setAttribute('aria-pressed', String(inProgram));
    $('deptBar').hidden = inProgram;
    $('programBar').hidden = !inProgram;

    $('typeField').hidden = inProgram;
    $('offeredField').hidden = inProgram;
    $('isolatedField').hidden = inProgram;
    $('electivesField').hidden = !inProgram;

    $('deptBar').replaceChildren(...DATA.meta.departments.map(d =>
        chip(d, state.depts.has(d), () => { toggleIn(state.depts, d); render(); })));

    const counts = new Map();
    for (const c of COURSES.values()) {
        if (state.depts.has(c.dept) && isOffered(c, state.offered)) counts.set(typeKey(c), (counts.get(typeKey(c)) || 0) + 1);
    }
    $('typeChips').replaceChildren(...[...MAIN_TYPES, OTHER_TYPE].map(t =>
        chip(t, state.types.has(t), () => { toggleIn(state.types, t); render(); }, counts.get(t) || 0)));

    $('offered').value = state.offered;
    $('isolated').checked = state.isolated;
    $('electives').checked = state.electives;
    $('program').value = state.program;
    const years = Object.keys(DATA.plans[state.program]?.previous || {}).sort().reverse();
    $('startYear').hidden = !inProgram || !years.length;
    $('startYear').replaceChildren(...[String(DATA.meta.catalog_year), ...years].map((y, i) =>
        h('option', { value: i ? y : '', selected: (i ? y : '') === (years.includes(state.start) ? state.start : '') },
            `התחלתי ב${hebrewYear(+y + 1)}`)));

    const changed = inProgram ? Number(state.electives !== DEFAULTS.electives)
        : Number(state.offered !== DEFAULTS.offered) + Number(state.isolated !== DEFAULTS.isolated)
          + Number([...state.types].sort().join() !== [...DEFAULTS.types].sort().join());
    $('filterBadge').hidden = !changed;
    $('filterBadge').textContent = changed;

    $('planLabel').textContent = state.taken.size ? `תכנון · ${creditsOf([...state.taken])} ש״ס` : 'תכנון';
    $('planBtn').setAttribute('aria-pressed', String(state.planning));
    document.body.classList.toggle('planning', state.planning);

    const shown = cy.nodes().length;
    $('count').textContent = `${shown} קורסים`;
    $('empty').hidden = shown > 0;
    $('count').title = `שנה״ל ${hebrewYear(DATA.meta.latest_year)} · הנתונים עודכנו ${DATA.meta.generated}`;
    $('dataInfo').textContent = `הנתונים עודכנו ב־${DATA.meta.generated}.`;
    $('gradeScale').textContent = `ממוצע ${GRADE_DOMAIN[0]}–${GRADE_DOMAIN[1]}+`;
    syncPanels();
}

function setProgram(name) {
    state.program = name && DATA.plans[name] ? name : '';
    if (state.program) { store.set(PROGRAM_KEY, state.program); store.set(UPDATED_KEY, Date.now()); pushSoon(); }
    state.selected = null;
    state.info = null;
    renderDetails();
    render();
    writeHash();
}

function suggestedProgram() {
    const remembered = store.get(PROGRAM_KEY, null);
    if (DATA.plans[remembered]) return remembered;
    const byDept = [...state.depts].map(d => DEFAULT_PROGRAMS[d]).find(n => DATA.plans[n]);
    return byDept || Object.keys(DATA.plans)[0];
}

function resetFilters() {
    Object.assign(state, {
        depts: new Set(DEFAULTS.depts), types: new Set(DEFAULTS.types), offered: DEFAULTS.offered,
        isolated: DEFAULTS.isolated, electives: DEFAULTS.electives, selected: null, info: null,
    });
    renderDetails();
    render();
    writeHash();
}

function setupCanvasTools() {
    const zoomBy = f => cy.animate({ zoom: { level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 150 });
    $('zoomIn').addEventListener('click', () => zoomBy(1.25));
    $('zoomOut').addEventListener('click', () => zoomBy(0.8));
    $('zoomFit').addEventListener('click', () => fitGraph(cy.nodes(), true));

    const toggle = $('legendToggle');
    if (MOBILE.matches) toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true')));

    if (!store.get(HINT_KEY, false)) $('hint').hidden = false;
    $('hintClose').addEventListener('click', () => { $('hint').hidden = true; store.set(HINT_KEY, true); });

    // Hover card (pointer devices)
    const tip = $('tooltip');
    cy.on('mouseover', 'node', e => {
        if (!matchMedia('(hover: hover)').matches) return;
        const c = COURSES.get(e.target.id()), p = e.target.renderedPosition();
        const sems = (c.semesters || []).filter(s => +s.slice(0, 4) === DATA.meta.latest_year).map(partName).reverse();
        tip.replaceChildren(h('b', {}, c.name),
            h('div', { class: 'sub' }, [formatId(c.id), c.credits > 0 && `${c.credits} ש״ס`].filter(Boolean).join(' · ')),
            h('div', {}, [c.grades ? `ממוצע ${c.grades.mean.toFixed(1)}` : 'אין נתוני ציונים',
                sems.length ? `סמסטר ${sems.join(' + ')}` : 'לא מוצע השנה'].join(' · ')));
        tip.hidden = false;
        const x = Math.min(Math.max(8, p.x - tip.offsetWidth / 2), cy.width() - tip.offsetWidth - 8);
        const y = p.y - (NODE_H / 2) * cy.zoom() - tip.offsetHeight - 8;
        tip.style.left = `${x}px`;
        tip.style.top = `${y < 8 ? p.y + (NODE_H / 2) * cy.zoom() + 8 : y}px`;
    });
    cy.on('mouseout viewport tap', () => { tip.hidden = true; });
}

function setupControls() {
    const programSelect = $('program');
    const groups = [['חד-חוגיות', /חד[- ]חוגי/], ['דו-חוגיות', /דו[- ]חוגי/], ['משולבות ואחרות', /./]];
    const names = Object.keys(DATA.plans);
    const used = new Set();
    for (const [label, re] of groups) {
        const members = names.filter(n => !used.has(n) && re.test(n));
        members.forEach(n => used.add(n));
        if (members.length) programSelect.append(h('optgroup', { label }, members.map(n => h('option', { value: n }, shortProgram(n)))));
    }
    programSelect.addEventListener('change', () => setProgram(programSelect.value));
    $('modeDept').addEventListener('click', () => setProgram(''));
    $('modeProgram').addEventListener('click', () => { if (!state.program) setProgram(suggestedProgram()); });
    $('programInfoBtn').addEventListener('click', () => showInfo({ type: 'program' }));
    $('startYear').addEventListener('change', e => {
        state.start = e.target.value;
        store.set(START_KEY, state.start);
        store.set(UPDATED_KEY, Date.now());
        pushSoon();
        state.info = state.info?.type === 'program' ? state.info : null;
        render();
        renderDetails();
        writeHash();
    });
    $('emptyReset').addEventListener('click', resetFilters);

    $('offered').addEventListener('change', e => { state.offered = e.target.value; render(); });
    $('isolated').addEventListener('change', e => { state.isolated = e.target.checked; render(); });
    $('electives').addEventListener('change', e => { state.electives = e.target.checked; render(); });
    $('resetBtn').addEventListener('click', resetFilters);
    $('filtersClose').addEventListener('click', () => $('filtersBtn').click());

    $('filtersBtn').addEventListener('click', () => {
        const open = $('filters').hidden;
        $('filters').hidden = !open;
        $('filtersBtn').setAttribute('aria-expanded', String(open));
        if (open) $('details').hidden = true;
        renderPlanner();
        if (!open) renderDetails();
        syncPanels();
    });
    $('detailsClose').addEventListener('click', () => select(null));
    $('plannerClose').addEventListener('click', () => setPlanning(false));
    $('planBtn').addEventListener('click', () => setPlanning(!state.planning));
    $('helpBtn').addEventListener('click', () => $('help').showModal());
    document.addEventListener('keydown', e => {
        const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
        if (e.key === '/' && !typing) { e.preventDefault(); $('search').focus(); }
        if (e.key !== 'Escape' || $('help').open) return;
        if (!$('filters').hidden) $('filtersBtn').click();
        else if (state.selected || state.info) select(null);
    });
}

// ── URL state: #course=03661102&program=… ──────────────────────────────────
function writeHash() {
    const p = new URLSearchParams();
    if (state.program) p.set('program', state.program);
    if (state.program && state.start) p.set('start', state.start);
    if (state.selected) p.set('course', state.selected);
    if (state.planning) p.set('plan', '1');
    history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname + location.search);
}

function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.program = DATA.plans[p.get('program')] ? p.get('program') : '';
    state.planning = p.has('plan');
    if (/^\d{4}$/.test(p.get('start') || '')) state.start = p.get('start');
    const course = p.get('course');
    if (course && COURSES.has(course)) {
        const c = COURSES.get(course);
        if (!state.program && DATA.meta.departments.includes(c.dept)) {
            state.depts.add(c.dept);
            state.types.add(typeKey(c));
            if (!isOffered(c, state.offered)) state.offered = 'all';
        }
        return course;
    }
    return null;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function main() {
    try {
        const res = await fetch('data/courses.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        DATA = await res.json();
        COURSES = prepare(DATA);
    } catch (err) {
        console.error(err);
        $('status').replaceChildren(h('p', {}, 'שגיאה בטעינת הנתונים. נסו לרענן את הדף.'));
        return;
    }

    await document.fonts.ready;
    readPalette();
    cy = cytoscape({
        container: $('cy'), style: graphStyle(), layout: { name: 'preset' },
        minZoom: 0.08, maxZoom: 2.5, boxSelectionEnabled: false, autoungrabify: true,
    });
    cy.on('tap', 'node', e => {
        const id = e.target.id();
        if (!state.planning) select(id);
        else if (state.clickMode === 'taken') toggleTaken(id);
        else setPlan(id, state.plan.get(id) === state.target ? null : state.target);
    });
    cy.on('tap', e => { if (e.target === cy) select(null); });
    cy.on('viewport resize', drawBands);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readPalette();
        cy.style(graphStyle());
        render({ fit: false });
    });

    for (const id of state.plan.keys()) if (!COURSES.has(id)) state.plan.delete(id);
    state.target = planSemesters().find(s => s >= `${DATA.meta.latest_year}a`);
    setupControls();
    setupSearch();
    setupCanvasTools();
    setupCloud();
    const boot = () => {
        const initial = readHash();
        render();
        if (initial && !state.planning) select(initial, { focus: true });
        else renderDetails();
    };
    boot();
    window.addEventListener('hashchange', () => { state.selected = null; boot(); });
    $('status').classList.add('done');
}

document.addEventListener('DOMContentLoaded', main);
