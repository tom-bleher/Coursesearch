'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const LEVEL_LABELS = { 1: 'שנה א׳', 2: 'שנה ב׳', 3: 'שנה ג׳', 4: 'מתקדמים ותואר שני' };
const MAIN_TYPES = ['שיעור', 'סמינר', 'מעבדה', 'קריאה מודרכת'];
const OTHER_TYPE = 'אחר';
const GRADE_DOMAIN = [55, 90];           // fixed so colours mean the same in every view
const READABLE_ZOOM = 0.6;               // below this node labels become unreadable
const NODE_FONT = "Heebo, system-ui, sans-serif";
const NODE_W = 160, NODE_H = 50, H_GAP = 24, LINE_GAP = 26, ROW_GAP = 64, BAND_GAP = 40;
const STORAGE_KEY = 'coursesearch_taken', PLAN_KEY = 'coursesearch_plan';
const MOBILE = matchMedia('(max-width: 760px)');  // keep in sync with style.css
const OFFERED = [['current', 'השנה'], ['recent', 'בשלוש השנים האחרונות'], ['all', 'הכל']];
const DEFAULTS = { depts: ['מתמטיקה'], types: ['שיעור'], offered: 'current', isolated: false, electives: true };
const VIEWS = ['list', 'timeline', 'map'];
const HINT_KEY = 'coursesearch_hint_seen', PROGRAM_KEY = 'coursesearch_program';
const GRADES_KEY = 'coursesearch_grades', MANUAL_KEY = 'coursesearch_manual', HIDE_DONE_KEY = 'coursesearch_hide_done';
const UPDATED_KEY = 'coursesearch_updated', SYNCED_KEY = 'coursesearch_synced_uid', START_KEY = 'coursesearch_start';

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

// ── Picker: a dropdown in the page's direction (native <select> popups ignore RTL on macOS) ──
let openPicker = null;

function picker({ id, label, onchange, search = false, key, placeholder = '—' }) {
    const button = h('button', { type: 'button', class: 'picker-btn', id, 'data-focus-key': key, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label });
    const list = h('ul', { class: 'picker-list', role: 'listbox', tabindex: '-1', 'aria-label': label });
    const input = search ? h('input', { type: 'search', class: 'picker-search', placeholder: 'חיפוש', autocomplete: 'off', 'aria-label': label }) : null;
    const pop = h('div', { class: 'picker-pop card', hidden: true }, input, list);
    const el = h('div', { class: 'picker' }, button, pop);
    let options = [], shown = [], value = null, active = 0;

    const paint = () => [...list.querySelectorAll('[role=option]')].forEach((li, i) => {
        li.classList.toggle('active', i === active);
        if (i === active) li.scrollIntoView({ block: 'nearest' });
    });
    const fill = () => {
        const term = input ? input.value.trim() : '';
        shown = options.filter(o => o.label.includes(term) || (o.group || '').includes(term));
        let group;
        list.replaceChildren(...shown.flatMap((o, i) => [
            o.group && o.group !== group && h('li', { class: 'picker-group', role: 'presentation' }, (group = o.group)),
            h('li', { role: 'option', 'data-value': o.value, 'aria-selected': String(o.value === value),
                onmousedown: e => { e.preventDefault(); choose(o.value); }, onmousemove: () => { if (active !== i) { active = i; paint(); } } }, o.label),
        ]).filter(Boolean));
        if (!shown.length) list.append(h('li', { class: 'picker-empty' }, 'אין תוצאות'));
        active = Math.max(0, shown.findIndex(o => o.value === value));
        paint();
    };
    // Fixed position, so the popup isn't clipped by scrolling toolbars and panels
    const place = () => {
        const r = button.getBoundingClientRect(), below = innerHeight - r.bottom - 12, above = r.top - 12;
        const up = below < 240 && above > below;
        Object.assign(pop.style, {
            right: `${Math.max(8, innerWidth - r.right)}px`, minWidth: `${r.width}px`,
            top: up ? '' : `${r.bottom + 4}px`, bottom: up ? `${innerHeight - r.top + 4}px` : '',
            maxHeight: `${Math.min(440, up ? above : below)}px`,
        });
    };
    const open = () => {
        openPicker?.close();
        openPicker = api;
        pop.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        if (input) input.value = '';
        place();
        fill();
        (input || list).focus();
    };
    const close = (refocus = false) => {
        if (pop.hidden) return;
        pop.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (openPicker === api) openPicker = null;
        if (refocus) button.focus();
    };
    const choose = v => {
        close(true);
        if (v === value) return;
        value = v;
        render();
        onchange(v);
    };
    const render = () => {
        const current = options.find(o => o.value === value);
        button.replaceChildren(h('span', { class: 'picker-value' }, current ? current.short ?? current.label : placeholder));
    };

    button.addEventListener('click', () => (pop.hidden ? open() : close()));
    button.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    input?.addEventListener('input', fill);
    pop.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
            paint();
        } else if (e.key === 'Enter' && shown[active]) {
            e.preventDefault();
            choose(shown[active].value);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            close(true);
        } else if (e.key === 'Tab') {
            close();
        }
    });

    const api = {
        el, close,
        get value() { return value; },
        // options: [{value, label, short?, group?}]
        set(opts, v) { options = opts; value = v; render(); if (!pop.hidden) fill(); return api; },
    };
    return api;
}

// One open popup at a time; clicking elsewhere, scrolling the page or resizing closes it
document.addEventListener('mousedown', e => { if (openPicker && !openPicker.el.contains(e.target)) openPicker.close(); });
document.addEventListener('scroll', e => { if (openPicker && !openPicker.el.contains(e.target)) openPicker.close(); }, true);
addEventListener('resize', () => openPicker?.close());

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
// The canvas renders right-to-left; pin punctuation in Latin names to their letters with LRM marks.
// Calculus courses get the standard abbreviation on the map.
function canvasLabel(name) {
    name = name.replace('חשבון דיפרנציאלי ואינטגרלי', 'חדו״א');
    return /^[^\p{L}]*\p{Script=Latin}/u.test(name) ? `\u200E${name.replace(/([^\p{L}\p{N}\s])/gu, '\u200E$1\u200E')}\u200E` : name;
}
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
const pickers = {};
const state = {
    depts: new Set(DEFAULTS.depts),
    types: new Set(DEFAULTS.types),
    offered: DEFAULTS.offered,
    isolated: DEFAULTS.isolated,
    electives: DEFAULTS.electives,
    mode: 'unit',                        // 'program': my degree | 'unit': browse an academic unit's courses
    view: 'list',                        // program mode: 'list' | 'timeline' | 'map'
    faculty: '',                         // faculty whose programs (program mode) or units (unit mode) are listed
    program: '',
    selected: null,
    info: null,                          // program panel: {type: 'program'} | {type: 'category', index}
    start: store.get(START_KEY, '') || '', // catalog year the student started in ('' = current catalog)
    taken: new Set(store.get(STORAGE_KEY, [])),
    plan: new Map(Object.entries(store.get(PLAN_KEY, {}))),  // course id → semester, e.g. "2027b"
    grades: new Map(Object.entries(store.get(GRADES_KEY, {}))),  // course id → final grade (passed courses)
    manual: new Map(Object.entries(store.get(MANUAL_KEY, {}))),  // requirement without a course list → credits
    hideDone: store.get(HIDE_DONE_KEY, false),
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

// The part of a requirement the planner tracks (null when nothing is left). Courses outside the
// dataset count as met, except as an alternative to a course inside it: there they count only once
// marked as passed (from the prerequisite list in the course card).
function trackable(req, courses) {
    if (!req || typeof req === 'string') return courses.has(req) ? req : null;
    const [kind, items] = Object.entries(req)[0];
    if (kind === 'any') return items.some(r => reqIds(r).some(id => courses.has(id))) ? req : null;
    const kept = items.map(r => trackable(r, courses)).filter(Boolean);
    return kept.length > 1 ? { all: kept } : kept[0] ?? null;
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
const meets = done => id => done.has(id);
const canTake = (c, done) => satisfied(c.reqT, meets(done));
const partName = sem => (sem.endsWith('a') ? 'א׳' : 'ב׳');

function planSemesters() {
    const y = DATA.meta.latest_year;
    return [...new Set([y, y + 1, y + 2].flatMap(v => [`${v}a`, `${v}b`]).concat([...state.plan.values()]))].sort();
}
// The semester under way, or the next one over the summer. Semester "2027a" starts in October 2026;
// from February (semester א׳ exams) planning is for semester ב׳.
function currentSemester(now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth();  // 0 = January
    return m >= 7 ? `${y + 1}a` : m >= 1 ? `${y}b` : `${y}a`;
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
    const bands = [...byLevel.keys()].sort().map(l => ({ parts: [LEVEL_LABELS[l]], ids: byLevel.get(l) }));
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
        bands.push({ parts: bandParts(cat), title: cat.name, credits: cat.credits, category: cat.i, ids });
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
    if (!inProgram()) return semLabel(sem);
    const n = +sem.slice(0, 4) - (+(state.start || DATA.meta.catalog_year) + 1) + 1;
    return n >= 1 && n <= 5 ? `${semLabel(sem)} · שנה ${'אבגדה'[n - 1]}׳` : semLabel(sem);
}

const choose = cat => (cat.count && cat.count < cat.courses.length ? cat.count : null);
const isMandatory = cat => cat.required && !choose(cat);

// "שנה ב' - סמסטר א' - קורסי חובה בפיזיקה" → ["שנה ב׳", "סמסטר א׳", "חובה"]
function bandParts(cat) {
    if (!cat.year) return [...new Set(cat.name.split(/\s+-\s+/))];
    const span = cat.name.match(/שנים\s+([אבגד])'?\s*[-+]\s*([אבגד])/);
    const kind = cat.required ? 'חובה' : /סמינר/.test(cat.name) ? 'סמינר' : /סדנ/.test(cat.name) ? 'סדנה' : 'בחירה';
    const pick = choose(cat) ? ` (${cat.count} מתוך ${cat.courses.length})` : '';
    return [
        span ? `שנים ${span[1]}׳–${span[2]}׳` : `שנה ${'אבגד'[cat.year - 1]}׳`,
        cat.sem && `סמסטר ${'אב'[cat.sem - 1]}׳`,
        kind + pick,
    ].filter(Boolean);
}
const bandLabel = cat => bandParts(cat).join(' · ');

const inProgram = () => state.mode === 'program' && Boolean(state.program);
const currentView = () => (inProgram() ? programView() : deptView());

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
    const perLine = MOBILE.matches ? 4 : 8;
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
        text: v('--text'), node: v('--node'), nodeBorder: v('--node-border'), edge: v('--edge'), noGrade: v('--no-grade'),
        accent: v('--accent'), taken: v('--taken'), takenBg: v('--taken-bg'), open: v('--open'),
        plannedBg: v('--planned-bg'), warn: v('--warn'), highlight: v('--highlight'), highlightBorder: v('--highlight-border'),
        grades: [v('--grade-low'), v('--grade-mid'), v('--grade-high')].map(rgb),
    };
}

function gradeColor(mean) {
    if (mean == null) return palette.noGrade;
    const t = Math.min(1, Math.max(0, (mean - GRADE_DOMAIN[0]) / (GRADE_DOMAIN[1] - GRADE_DOMAIN[0]))) * 2;
    const [a, b] = t <= 1 ? [palette.grades[0], palette.grades[1]] : [palette.grades[1], palette.grades[2]];
    const f = t <= 1 ? t : t - 1;
    return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * f)).join(',')})`;
}

function graphStyle() {
    return [
        {
            selector: 'node', style: {
                'label': 'data(label)', 'shape': 'round-rectangle', 'corner-radius': 6, 'width': NODE_W, 'height': NODE_H,
                // a plain card with the grade colour as a strip on its right (start) edge
                'background-color': palette.node, 'background-fill': 'linear-gradient', 'background-gradient-direction': 'to-left',
                'background-gradient-stop-colors': n => `${n.data('color')} ${n.data('color')} ${palette.node} ${palette.node}`,
                'background-gradient-stop-positions': '0 4 4 100',
                'border-width': 1, 'border-color': palette.nodeBorder,
                'color': palette.text, 'font-family': NODE_FONT, 'font-size': 13.5, 'line-height': 1.2,
                'font-weight': 500, 'text-wrap': 'wrap', 'text-max-width': NODE_W - 22,
                'text-valign': 'center', 'text-halign': 'center',
                'transition-property': 'opacity', 'transition-duration': '150ms',
            },
        },
        { selector: 'node.past', style: { 'border-style': 'dashed' } },
        {
            selector: 'edge', style: {
                'width': 1.2, 'line-color': palette.edge, 'target-arrow-color': palette.edge,
                'target-arrow-shape': 'triangle', 'arrow-scale': 0.75, 'curve-style': 'bezier', 'opacity': 0.4,
            },
        },
        { selector: 'edge.alt', style: { 'line-style': 'dotted', 'width': 1.5 } },
        { selector: 'edge.coreq', style: { 'line-style': 'dashed', 'target-arrow-shape': 'none' } },
        { selector: '.faded', style: { 'opacity': 0.15 } },
        { selector: 'edge.hl', style: { 'line-color': palette.accent, 'target-arrow-color': palette.accent, 'opacity': 1, 'width': 1.8 } },
        { selector: 'node.hl', style: { 'border-color': palette.accent, 'border-width': 1.5 } },
        { selector: 'node.focus', style: { 'border-color': palette.accent, 'border-width': 3 } },
        // Planning: the course's status replaces its grade colour
        { selector: 'node.taken, node.open, node.planned, node.locked', style: { 'background-fill': 'solid' } },
        { selector: 'node.taken', style: { 'background-color': palette.takenBg, 'border-color': palette.taken, 'border-width': 1.5 } },
        { selector: 'node.open', style: { 'background-color': palette.highlight, 'border-color': palette.highlightBorder, 'border-width': 1.5 } },
        { selector: 'node.planned', style: { 'background-color': palette.plannedBg, 'border-color': palette.open, 'border-width': 1.5 } },
        { selector: 'node.invalid', style: { 'border-color': palette.warn, 'border-style': 'double', 'border-width': 4 } },
        { selector: 'node.locked', style: { 'background-color': palette.node, 'opacity': 0.35 } },
        { selector: 'edge.peek', style: { 'line-color': palette.accent, 'target-arrow-color': palette.accent, 'opacity': 0.9, 'width': 1.8 } },
    ];
}

// ── Rendering ────────────────────────────────────────────────────────────────
let view = null;

const nodeLabel = id => (state.taken.has(id) ? '✓ ' : '') + canvasLabel(COURSES.get(id).name)
    + (state.plan.has(id) ? `\n${semLabel(state.plan.get(id))}` : '');

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
    renderSheet();
    if (!$('details').hidden) renderDetails();  // e.g. the course may have left the graph
    renderChrome();  // before fitting: it sets the body classes the legend's size depends on
    if (fit) fitGraph(cy.nodes());
}

// Fit nodes into the part of the viewport not covered by band labels (right) or the details panel
function fitGraph(eles, animate = false) {
    if (!eles.length) return;
    const pad = 32, mobile = MOBILE.matches;
    const panel = $('details');
    const gutterNow = mobile || !gutter ? 0 : gutter + 24;
    const hint = $('hint').hidden ? 0 : $('hint').offsetHeight + 8;
    const top = pad + hint + (mobile && bandModel.length ? 34 : 0);  // room for the tip and the first band's label
    const left = pad + (!panel.hidden && !mobile ? panel.offsetWidth + 12 : 0);
    // keep clear of the zoom and legend (desktop) or the bottom sheet (mobile)
    const tools = document.querySelector('.canvas-tools').offsetHeight;
    const bottom = pad + (!panel.hidden && mobile ? panel.offsetHeight + 8 : tools);
    const w = Math.max(80, cy.width() - left - pad - gutterNow), hgt = Math.max(80, cy.height() - top - bottom);
    const bb = eles.boundingBox();
    // Tall graphs: rather than shrinking past readability, fit the width and start at the top
    const zoom = Math.min(1.3, w / bb.w, Math.max(hgt / bb.h, READABLE_ZOOM));
    const x = left + (w - bb.w * zoom) / 2, y = top + Math.max(0, (hgt - bb.h * zoom) / 2);
    const pan = { x: x - bb.x1 * zoom, y: y - bb.y1 * zoom };
    if (animate) cy.animate({ zoom, pan, duration: 350 });
    else cy.viewport({ zoom, pan });
}

// Bands are drawn under the graph; their labels sit in the page margin above it (so they stay clickable)
let gutter = 0;

function drawBands() {
    $('bands').replaceChildren(...bandModel.map(() => h('div', { class: 'band' })));
    $('margin').replaceChildren(...bandModel.map((b, i) => {
        const [title, ...rest] = b.parts;
        const sub = [...rest, b.credits && `${b.credits} ש״ס`].filter(Boolean).join(' · ');
        // A heading shared with the band above ("שנה א׳") is written once, like a section title
        const content = [title !== bandModel[i - 1]?.parts[0] && h('span', { class: 'band-title' }, title),
            sub && h('span', { class: 'band-sub' }, sub)];
        return b.category == null
            ? h('div', { class: 'band-label' }, content)
            : h('button', { class: 'band-label', title: `${b.title} · לחצו לפרטים`, onclick: () => showInfo({ type: 'category', index: b.category }) }, content);
    }));
    // The margin is as wide as its widest label, up to 30% of the canvas
    const margin = $('margin');
    margin.style.setProperty('--gutter', 'max-content');
    const widest = Math.ceil(Math.max(0, ...[...margin.children].map(l => l.getBoundingClientRect().width)));
    gutter = MOBILE.matches ? 0 : Math.min(widest, cy.width() * 0.3);
    margin.style.setProperty('--gutter', `${gutter}px`);
    placeBands();
}

function placeBands() {
    const zoom = cy.zoom(), pan = cy.pan(), gap = bandGapNow();
    const bands = $('bands').children, labels = $('margin').children;
    bandModel.forEach((b, i) => {
        const top = (b.top - NODE_H / 2) * zoom + pan.y - (MOBILE.matches ? 34 : (gap / 2 - 4) * zoom);
        const bottom = (b.bottom + NODE_H / 2 + gap / 2 - 4) * zoom + pan.y;
        Object.assign(bands[i].style, { top: `${top}px`, height: `${Math.max(0, bottom - top)}px` });
        labels[i].style.top = `${top}px`;
    });
}

function applyHighlight() {
    cy.batch(() => {
        cy.elements().removeClass('faded hl focus taken planned invalid');
        // Recorded progress: passed and planned courses replace their grade colour
        cy.nodes().forEach(n => {
            const id = n.id();
            n.data('label', nodeLabel(id));
            if (state.taken.has(id)) n.addClass('taken');
            else if (state.plan.has(id)) n.addClass(planIssues(id, state.plan.get(id)).length ? 'planned invalid' : 'planned');
        });
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

// Courses outside the dataset have no card, so they are marked as passed right here
function courseButton(id) {
    const inData = COURSES.has(id);
    return h('span', {},
        inData
            ? h('button', { class: `course-link${state.taken.has(id) ? ' done' : state.plan.has(id) ? ' planned' : ''}`, onclick: () => select(id, { focus: true }) }, h('bdi', {}, courseName(id)))
            : h('label', { class: 'check external', title: 'קורס מחוץ לאתר: סמנו אם עברתם אותו' },
                h('input', { type: 'checkbox', checked: state.taken.has(id), onchange: () => toggleTaken(id) }),
                h('bdi', {}, courseName(id))),
        ' ', h('span', { class: 'course-id' }, formatId(id)));
}

// Long lists show the first few courses; the rest open on demand
function courseList(ids, shown = 8) {
    const items = ids.map(id => h('li', {}, courseButton(id)));
    if (ids.length <= shown + 2) return h('ul', { class: 'req' }, items);
    return [h('ul', { class: 'req' }, items.slice(0, shown)),
        h('details', { class: 'more' }, h('summary', {}, `עוד ${ids.length - shown} קורסים`), h('ul', { class: 'req' }, items.slice(shown)))];
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
            g.dist.map((n, i) => {
                const bar = h('div', { class: 'bar', title: n }, h('span', {}, n || ''));
                const [lo, hi] = DATA.meta.grade_bins[i].split('-').map(Number);
                bar.style.height = `${(n / max) * 100}%`;
                bar.style.background = gradeColor((lo + hi) / 2);  // same scale as the courses on the map
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
        if (state.info && view.program) renderProgramInfo();
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

    const facts = [['מרצים', c.lecturers?.join(', ')], ['הערכה', c.exams?.join(', ')], ['בתוכנית', cats?.join(' · ')]]
        .filter(([, v]) => v);

    $('detailsBody').replaceChildren(h('div', {},
        h('h2', {}, c.name),
        h('p', { class: 'card-sub' }, [formatId(c.id), c.type !== 'שיעור' && c.type, view.required.has(c.id) && 'חובה בתוכנית']
            .filter(Boolean).join(' · ')),
        h('div', { class: 'stats' },
            statBox(g ? g.mean.toFixed(1) : '—', 'ממוצע', g && gradeColor(g.mean)),
            statBox(c.credits > 0 ? c.credits : '—', 'ש״ס'),
            thisYear.length
                ? statBox(thisYear.join(' + '), `סמסטר ב${hebrewYear(latest)}`)
                : statBox('לא השנה', c.last ? `לאחרונה ${semLabel(c.last)}` : 'לא מוצע')),
        !inGraph && h('p', { class: 'muted small', style: 'margin-top:10px' }, 'לא מוצג בגרף עם המסננים הנוכחיים'),
        [h('h3', {}, 'דרישות קדם'), c.req ? reqList(c.req) : h('p', { class: 'muted' }, 'אין')],
        c.coreq && [h('h3', {}, 'במקביל'), reqList(c.coreq)],
        h('div', { class: 'plan-box' },
            state.taken.size > 0 && !state.taken.has(c.id) && h('p', { class: canTake(c, state.taken) ? 'ok' : 'warn' },
                canTake(c, state.taken) ? '✓ עמדת בדרישות' : `חסר: ${reqText(unmet(c.reqT, meets(state.taken)))}`),
            h('div', { class: 'plan-row' },
                h('label', { class: 'check' },
                    h('input', { type: 'checkbox', checked: state.taken.has(c.id), onchange: () => toggleTaken(c.id) }),
                    h('span', {}, 'עברתי')),
                state.taken.has(c.id)
                    ? h('label', { class: 'check' }, h('span', {}, 'ציון'), gradeInput(c.id))
                    : h('div', { class: 'check' }, h('span', {}, 'מתוכנן ל־'), planPicker(c.id, '—').el)),
            state.plan.has(c.id) && planIssues(c.id, state.plan.get(c.id)).map(t => h('p', { class: 'warn' }, `⚠ ${t}`))),
        h('div', { class: 'links' },
            c.syllabus && h('a', { href: c.syllabus, target: '_blank', rel: 'noopener' }, 'סילבוס'),
            drishot && h('a', { href: drishot, target: '_blank', rel: 'noopener' }, 'דרישות באתר האוניברסיטה')),
        g && [
            h('h3', {}, 'התפלגות ציונים'),
            histogram(g),
            h('p', { class: 'muted small' }, `${g.n.toLocaleString('he-IL')} סטודנטים, ${semLabel(g.by_sem[0][0])}–${semLabel(g.by_sem.at(-1)[0])}`),
            g.by_sem.length > 1 && h('details', { class: 'more' }, h('summary', {}, 'לפי סמסטר'),
                h('ul', { class: 'trend' }, g.by_sem.slice().reverse().map(([s, m, n]) =>
                    h('li', { title: `${n} סטודנטים` }, `${semLabel(s)}: `, h('b', {}, m.toFixed(1)))))),
        ],
        facts.length > 0 && h('dl', { class: 'facts' }, facts.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
        dependents.length > 0 && [h('h3', {}, `פותח את (${dependents.length})`), courseList(dependents, 5)],
    ));
    panel.hidden = false;
    panel.scrollTop = 0;
    syncPanels();
}

// ── Program & category info ─────────────────────────────────────────────────
function showInfo(info) {
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
            courseList(cat.courses.filter(id => COURSES.has(id)), 20),
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
    document.body.classList.toggle('panel-open', !$('details').hidden);
}

// ── Recording progress: passed courses (with an optional grade), planned courses, credits by hand ──
// `quiet` saves without re-rendering, for inputs that are still being edited
function saveProgress({ quiet = false } = {}) {
    if (inProgram()) store.set(PROGRAM_KEY, state.program);
    store.set(STORAGE_KEY, [...state.taken]);
    store.set(PLAN_KEY, Object.fromEntries(state.plan));
    store.set(GRADES_KEY, Object.fromEntries(state.grades));
    store.set(MANUAL_KEY, Object.fromEntries(state.manual));
    store.set(UPDATED_KEY, Date.now());
    pushSoon();
    if (quiet) renderSummary();
    else refreshProgress();
}

function refreshProgress() {
    applyHighlight();
    renderSheet();
    renderDetails();
    renderChrome();
}

function toggleTaken(id) {
    if (state.taken.delete(id)) state.grades.delete(id);
    else { state.taken.add(id); state.plan.delete(id); }
    saveProgress();
}

function markTaken(ids) {
    ids.forEach(id => { state.taken.add(id); state.plan.delete(id); });
    saveProgress();
}

function setPlan(id, sem) {
    if (sem) { state.plan.set(id, sem); state.taken.delete(id); state.grades.delete(id); } else state.plan.delete(id);
    saveProgress();
}

function setGrade(id, value) {
    const grade = Number(value);
    if (value !== '' && !(grade >= 0 && grade <= 100)) return;  // the field shows it as invalid
    if (value === '') state.grades.delete(id);
    else state.grades.set(id, Math.round(grade * 10) / 10);
    // the same course may have a grade field in both the checklist and its card
    document.querySelectorAll(`input.grade[data-course="${id}"]`).forEach(i => { i.value = state.grades.get(id) ?? ''; });
    saveProgress({ quiet: true });
}

function setManual(key, value) {
    const credits = Number(value);
    if (value === '' || !(credits > 0)) state.manual.delete(key);
    else state.manual.set(key, credits);
    saveProgress({ quiet: true });
    renderSectionHeads();
}

function clearProgress() {
    if (!confirm('למחוק את כל הקורסים, הציונים והתכנון שסימנת?')) return;
    state.taken.clear();
    state.plan.clear();
    state.grades.clear();
    state.manual.clear();
    saveProgress();
}

// Credit-weighted average of the grades entered; courses without credit data are left out
function weightedAverage() {
    let sum = 0, weight = 0, n = 0;
    for (const [id, grade] of state.grades) {
        const credits = COURSES.get(id)?.credits;
        if (!state.taken.has(id) || !credits) continue;
        sum += grade * credits;
        weight += credits;
        n++;
    }
    return weight ? { mean: sum / weight, n } : null;
}

const gradeInput = id => h('input', {
    type: 'number', class: 'grade', min: 0, max: 100, step: 'any', inputmode: 'decimal', placeholder: 'ציון',
    'data-course': id, 'aria-label': `ציון ב${courseName(id)}`, value: state.grades.get(id) ?? '',
    onchange: e => setGrade(id, e.target.value),
});

const planPicker = (id, empty, key) => picker({ label: `תכנון ${courseName(id)}`, key, onchange: v => setPlan(id, v || null) })
    .set([{ value: '', label: 'לא מתוכנן', short: empty },
        ...planSemesters().map(s => ({ value: s, label: semOption(s), short: semLabel(s) }))], state.plan.get(id) || '');

// Required parts without a catalog figure (joint programs) need all their courses' credits
const creditsNeeded = cat => minCredits(cat.credits) || (isMandatory(cat) ? creditsOf(cat.courses) : 0);
const minCredits = text => Number(String(text ?? '').split('-')[0]) || 0;  // "59-61" → 59

// A course may be listed in several categories (e.g. core courses in year 2 and year 3), but counts
// toward one: a mandatory category if listed in one, else the first that still needs credits.
function allocateCredits(cats) {
    const order = [...cats.filter(isMandatory), ...cats.filter(c => !isMandatory(c))];
    const got = new Map(cats.map(c => [c.i, { done: 0, planned: 0, ids: [] }]));
    const room = c => creditsNeeded(c) > got.get(c.i).done + got.get(c.i).planned;
    for (const [ids, key] of [[state.taken, 'done'], [state.plan.keys(), 'planned']]) {
        for (const id of [...ids].sort()) {
            const homes = order.filter(c => c.courses.includes(id));
            const home = homes.find(c => isMandatory(c) || room(c)) || homes[0];
            if (!home) continue;
            got.get(home.i)[key] += COURSES.get(id)?.credits || 0;
            got.get(home.i).ids.push(id);
        }
    }
    return got;
}

// ── My degree: sections (years, "שאר רוח") → categories → courses ──────────
const norm = text => text.replace(/\s+/g, ' ').trim();
const manualKey = name => (/שאר רוח/.test(name) ? 'שאר רוח' : norm(name));  // shared across programs
const yearLetter = name => name.match(/^שנה\s+([אבגד])/)?.[1];

// Catalog categories are named after their section ("שנה ב' - סמסטר א' - …"; the longest matching
// section wins). Sections without categories, such as "שאר רוח", are recorded as credits by hand.
function degreeSections(program, cats) {
    const sections = (program.sections || []).map(s => ({ ...s, key: norm(s.name), cats: [] }));
    const other = new Map();
    for (const cat of cats) {
        const home = sections.filter(s => cat.name === s.key || cat.name.startsWith(`${s.key} - `))
            .sort((a, b) => b.key.length - a.key.length)[0];
        if (home) { home.cats.push(cat); continue; }
        // programs without catalog sections (joint programs) are grouped by year
        const name = cat.year ? `שנה ${'אבגד'[cat.year - 1]}׳` : 'כללי';
        if (!other.has(name)) other.set(name, { name, key: name, cats: [] });
        other.get(name).cats.push(cat);
    }
    return [...sections.filter(s => s.cats.length || minCredits(s.credits)), ...other.values()];
}

// Credits done / planned / needed for a section
function sectionProgress(section, alloc) {
    if (!section.cats.length) {
        return { done: state.manual.get(manualKey(section.name)) || 0, planned: 0, need: minCredits(section.credits) };
    }
    const sum = key => section.cats.reduce((n, cat) => n + alloc.get(cat.i)[key], 0);
    // without a catalog figure, the target is known only if every part's is
    const need = minCredits(section.credits)
        || (section.cats.every(cat => creditsNeeded(cat)) ? section.cats.reduce((n, cat) => n + creditsNeeded(cat), 0) : 0);
    return { done: sum('done'), planned: sum('planned'), need };
}

function meter(done, planned, need) {
    const bar = h('div', { class: 'meter', role: 'img', 'aria-label': `${done} מתוך ${need}` }, h('i', { class: 'done' }), h('i', { class: 'planned' }));
    const d = need ? Math.min(100, (done / need) * 100) : 0;
    bar.children[0].style.width = `${d}%`;
    bar.children[1].style.width = `${need ? Math.min(100 - d, (planned / need) * 100) : 0}%`;
    return bar;
}

const creditText = ({ done, planned, need }) => `${done}${planned ? ` + ${planned}` : ''}${need ? ` / ${need}` : ''} ש״ס`;

let degree = null;  // the rendered program: {program, sections, alloc}
const openLists = new Set();  // folded course lists the student opened (kept across re-renders)

function renderSheet() {
    const sheet = $('sheet');
    sheet.hidden = state.mode !== 'program' || (state.program && state.view === 'map');
    if (sheet.hidden) return;
    // Keep keyboard focus: on the same control, or where it was if that control is gone
    const focusKey = document.activeElement?.dataset?.focusKey;
    const focusIndex = [...sheet.querySelectorAll('[data-focus-key]')].indexOf(document.activeElement);
    if (!state.program) {
        degree = null;
        sheet.replaceChildren(programChooser());
    } else {
        const program = view.program;
        degree = { program, sections: degreeSections(program, view.cats), alloc: allocateCredits(view.cats) };
        sheet.replaceChildren(h('div', { class: 'sheet-inner' },
            h('div', { id: 'summary', class: 'summary' }),
            state.view === 'timeline' ? timeline() : degreeList()));
        renderSummary();
    }
    if (focusKey) {
        const all = [...sheet.querySelectorAll('[data-focus-key]')];
        (sheet.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`) || all[Math.min(focusIndex, all.length - 1)])?.focus();
    }
}

function renderSummary() {
    const el = $('summary');
    if (!el || !degree) return;
    const { program, sections, alloc } = degree;
    const parts = sections.map(s => ({ s, ...sectionProgress(s, alloc) }));
    const done = parts.reduce((n, p) => n + p.done, 0), planned = parts.reduce((n, p) => n + p.planned, 0);
    const need = program.total || (parts.every(p => p.need) ? parts.reduce((n, p) => n + p.need, 0) : 0);
    const avg = weightedAverage();
    const issues = [...state.plan].filter(([id, sem]) => COURSES.has(id) && planIssues(id, sem).length).length;
    el.replaceChildren(...[
        h('div', { class: 'summary-top' },
            h('div', { class: 'summary-total' },
                h('b', {}, String(done)), h('span', {}, need ? ` / ${need} ש״ס` : ' ש״ס'),
                planned > 0 && h('span', { class: 'muted' }, ` · ${planned} מתוכננים`)),
            h('div', { class: 'summary-side' },
                h('span', {}, avg ? [h('b', {}, avg.mean.toFixed(1)), ` ממוצע (${avg.n} ציונים)`] : h('span', { class: 'muted' }, 'אין ציונים')),
                issues > 0 && h('button', { class: 'btn-link warn', onclick: () => setView('timeline') }, issues === 1 ? 'בעיה אחת בתכנון' : `${issues} בעיות בתכנון`))),
        need > 0 && meter(done, planned, need),
        h('div', { class: 'summary-sections' }, parts.map(p => h('a', { href: `#sec-${sections.indexOf(p.s)}`, class: `section-chip${p.need && p.done >= p.need ? ' complete' : ''}`,
            onclick: e => { e.preventDefault(); $(`sec-${sections.indexOf(p.s)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } },
            h('span', {}, p.s.name), h('b', {}, `${p.done}${p.need ? `/${p.need}` : ''}`)))),
    ].filter(Boolean));
}

// After credits are entered by hand, without re-rendering the field being edited
function renderSectionHeads() {
    if (!degree) return;
    degree.sections.forEach((s, i) => {
        const el = document.querySelector(`#sec-${i} .section-head .muted`);
        if (el) el.textContent = creditText(sectionProgress(s, degree.alloc));
    });
}

function degreeList() {
    const { sections, alloc } = degree;
    const home = new Map();  // course → the category it counts toward
    alloc.forEach((a, i) => a.ids.forEach(id => home.set(id, i)));
    return h('div', { class: 'degree' },
        h('div', { class: 'degree-tools' },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.hideDone, 'data-focus-key': 'hide-done',
                onchange: e => { state.hideDone = e.target.checked; store.set(HIDE_DONE_KEY, state.hideDone); renderSheet(); } }), h('span', {}, 'הסתרת קורסים שעברתי')),
            degree.program.url && h('a', { href: degree.program.url, target: '_blank', rel: 'noopener' }, 'הידיעון'),
            (degree.program.parts || []).length > 0 && h('span', {}, 'הכללים המלאים בידיעון של כל חוג: ',
                degree.program.parts.map((x, i) => [i > 0 && ' · ', h('a', { href: x.url, target: '_blank', rel: 'noopener' }, shortProgram(x.name))]))),
        sections.map((section, si) => {
            const progress = sectionProgress(section, alloc);
            return h('section', { class: 'degree-section', id: `sec-${si}` },
                h('div', { class: 'section-head' }, h('h2', {}, section.name), h('span', { class: 'muted' }, creditText(progress))),
                section.cats.length
                    ? section.cats.map(cat => categoryBlock(cat, section, alloc.get(cat.i), home))
                    : manualBlock(section, progress));
        }),
        (state.taken.size > 0 || state.plan.size > 0) && h('button', { class: 'btn btn-quiet clear-all', onclick: clearProgress }, 'מחיקת כל הסימונים'));
}

// Requirements the data can't list (e.g. "שאר רוח" courses from other faculties): credits by hand
function manualBlock(section, progress) {
    const key = manualKey(section.name);
    return h('div', { class: 'cat' },
        h('div', { class: 'cat-body manual' },
            h('p', { class: 'muted' }, 'הקורסים לא מופיעים באתר. רשמו כמה נקודות צברתם:'),
            h('label', { class: 'check' },
                h('input', { type: 'number', class: 'grade', min: 0, step: 'any', inputmode: 'decimal', value: state.manual.get(key) ?? '', 'data-focus-key': `manual:${key}`,
                    'aria-label': `נקודות ב${section.name}`, onchange: e => setManual(key, e.target.value) }),
                h('span', {}, progress.need ? `מתוך ${progress.need} ש״ס` : 'ש״ס'))),
        section.note && h('details', { class: 'about' }, h('summary', {}, 'פרטים'), h('div', { class: 'note' }, section.note)));
}

function categoryBlock(cat, section, got, home) {
    const need = creditsNeeded(cat), pick = choose(cat), mandatory = isMandatory(cat);
    let parts = bandParts(cat);
    if (parts.length > 1 && ((yearLetter(parts[0]) && yearLetter(parts[0]) === yearLetter(section.key)) || parts[0] === section.key)) parts = parts.slice(1);
    const listed = cat.courses;
    // A required part is complete once all its courses are passed, even when the catalog's credit
    // figure is higher than their sum or some courses lack credit data
    const complete = mandatory ? listed.every(id => state.taken.has(id))
        : need ? got.done >= need : pick ? got.ids.filter(id => state.taken.has(id)).length >= pick : false;
    const status = need ? creditText({ ...got, need }) : pick ? `נבחרו ${got.ids.length} מתוך ${pick}` : `${listed.filter(id => state.taken.has(id)).length}/${listed.length} קורסים`;
    const open = listed.filter(id => !state.taken.has(id));
    // Long elective lists fold after the first few, in catalog order (rows never move when marked)
    const ids = state.hideDone ? listed.filter(id => !state.taken.has(id)) : listed;
    const shown = mandatory || ids.length <= 10 ? ids : ids.slice(0, 8), folded = ids.slice(shown.length);
    const chosenInFold = folded.filter(id => rank(id) < 2).length;
    const rows = ids => h('ul', { class: 'rows' }, ids.map(id => courseRow(id, cat, home)));
    const listKey = `${state.program}:${cat.i}`;
    return h('div', { class: `cat${complete ? ' complete' : ''}` },
        h('div', { class: 'cat-head' },
            h('div', {},
                h('span', { class: 'cat-title', title: cat.name }, parts.join(' · ')),
                h('span', { class: 'cat-status' }, complete ? `✓ ${status}` : status)),
            mandatory && open.length > 1 && h('button', { class: 'btn btn-small', onclick: () => markTaken(open) }, 'סימון הכל כעבר')),
        need > 0 && meter(got.done, got.planned, need),
        !(state.hideDone && complete) && [
            rows(shown),
            folded.length > 0 && h('details', { class: 'more', open: openLists.has(listKey), ontoggle: e => { e.target.open ? openLists.add(listKey) : openLists.delete(listKey); } },
                h('summary', {}, `עוד ${folded.length} קורסים${chosenInFold ? ` (${chosenInFold} נבחרו)` : ''}`), rows(folded)),
        ],
        cat.note && h('details', { class: 'about' }, h('summary', {}, 'הערות'), h('div', { class: 'note' }, cat.note)));
}

const rank = id => (state.taken.has(id) ? 0 : state.plan.has(id) ? 1 : 2);

function courseRow(id, cat, home) {
    const c = COURSES.get(id), taken = state.taken.has(id), sem = state.plan.get(id);
    const key = `${cat.i}:${id}`;
    const pills = [];
    if (taken || sem) {
        if (home.has(id) && home.get(id) !== cat.i) pills.push(h('span', { class: 'pill' }, 'נספר בחלק אחר'));
    }
    if (c && sem) planIssues(id, sem).forEach(t => pills.push(h('span', { class: 'pill warn' }, t)));
    else if (c && !taken) {
        const missing = unmet(c.reqT, meets(new Set([...state.taken, ...state.plan.keys()])));
        if (missing) pills.push(h('span', { class: 'pill', title: reqText(missing) }, `חסר: ${reqText(missing)}`));
        if (!offeredNow(c)) pills.push(h('span', { class: 'pill' }, 'לא מוצע השנה'));
    }
    return h('li', { class: `row${taken ? ' done' : sem ? ' planned' : ''}` },
        h('input', { type: 'checkbox', checked: taken, 'data-focus-key': `${key}:taken`, 'aria-label': `עברתי: ${courseName(id)}`, onchange: () => toggleTaken(id) }),
        h('div', { class: 'row-main' },
            c ? h('button', { class: 'course-link', onclick: () => select(id) }, h('bdi', {}, c.name)) : h('bdi', {}, courseName(id)),
            h('span', { class: 'course-id' }, formatId(id.slice(0, 8))),
            pills.length > 0 && h('div', { class: 'pills' }, pills)),
        h('span', { class: 'row-credits', title: c?.credits ? null : 'אין נתוני נקודות זכות' }, c?.credits ? `${c.credits} ש״ס` : '—'),
        h('div', { class: 'row-status' }, taken ? gradeInput(id) : c && planPicker(id, 'תכנון', `${key}:plan`).el));
}

// ── Semesters: what I passed and what I plan, semester by semester ──────────
function timeline() {
    const inProgramIds = new Set(view.cats.flatMap(cat => cat.courses).filter(id => COURSES.has(id)));
    const passed = [...state.taken].filter(id => COURSES.has(id)).sort((a, b) => courseName(a).localeCompare(courseName(b), 'he'));
    const column = (title, sub, ids, footer, cls = '') => h('section', { class: `term ${cls}` },
        h('div', { class: 'term-head' }, h('b', {}, title), h('span', { class: 'muted' }, sub)),
        ids.length ? h('ul', { class: 'term-list' }, ids.map(footer.item)) : h('p', { class: 'muted small term-empty' }, footer.empty),
        footer.add);
    const addPicker = sem => {
        const done = doneBefore(sem);
        const candidates = [...inProgramIds].filter(id => !state.taken.has(id) && !state.plan.has(id) && offeredInPart(COURSES.get(id), sem));
        // the name is direction-isolated (\u2068…\u2069) so an English name doesn't swallow the Hebrew after it
        const opt = (id, group) => ({ value: id, label: `\u2068${COURSES.get(id).name}\u2069${COURSES.get(id).credits ? ` · ${COURSES.get(id).credits} ש״ס` : ''}`, group });
        const ready = candidates.filter(id => canTake(COURSES.get(id), done)), blocked = candidates.filter(id => !ready.includes(id));
        const p = picker({ label: `הוספת קורס ל${semLabel(sem)}`, search: true, key: `add:${sem}`, placeholder: '+ הוספת קורס', onchange: id => setPlan(id, sem) })
            .set([...ready.map(id => opt(id, 'אפשר לקחת')), ...blocked.map(id => opt(id, 'חסרות דרישות קדם'))], null);
        p.el.classList.add('term-add');
        return p.el;
    };
    return h('div', { class: 'timeline' },
        column('עברתי', `${passed.length} קורסים · ${creditsOf(passed)} ש״ס`, passed, {
            empty: 'סמנו קורסים שעברתם ברשימה.',
            item: id => h('li', { class: 'term-item' },
                h('button', { class: 'course-link', onclick: () => select(id) }, h('bdi', {}, courseName(id))),
                h('span', { class: 'muted small' }, [COURSES.get(id).credits && `${COURSES.get(id).credits} ש״ס`, state.grades.has(id) && `ציון ${state.grades.get(id)}`].filter(Boolean).join(' · '))),
        }, 'passed'),
        planSemesters().map(sem => {
            const ids = plannedIn(sem).filter(id => COURSES.has(id));
            return column(semOption(sem), `${creditsOf(ids)} ש״ס`, ids, {
                empty: 'אין קורסים מתוכננים.',
                add: addPicker(sem),
                item: id => {
                    const issues = planIssues(id, sem);
                    return h('li', { class: `term-item${issues.length ? ' invalid' : ''}` },
                        h('div', { class: 'term-row' },
                            h('button', { class: 'course-link', onclick: () => select(id) }, h('bdi', {}, courseName(id))),
                            h('button', { class: 'btn btn-icon btn-small', 'aria-label': `הסרת ${courseName(id)} מהתכנון`, 'data-focus-key': `rm:${sem}:${id}`, onclick: () => setPlan(id, null) }, '×')),
                        h('span', { class: 'muted small' }, COURSES.get(id).credits ? `${COURSES.get(id).credits} ש״ס` : ''),
                        issues.map(t => h('span', { class: 'pill warn' }, t)));
                },
            });
        }));
}

// Program mode before a program is chosen: the faculty's programs
function programChooser() {
    const options = pickers.program.options.filter(o => programFaculty(o.value) === state.faculty);
    let group;
    return h('div', { class: 'sheet-inner chooser' },
        h('h2', {}, 'בחרו תוכנית לימודים'),
        h('p', { class: 'muted' }, 'תוכניות הפקולטה ל' + state.faculty + '. אפשר להחליף פקולטה בסרגל למעלה.'),
        h('ul', { class: 'chooser-list' }, options.map(o => [
            o.group !== group && h('li', { class: 'chooser-group' }, (group = o.group)),
            h('li', {}, h('button', { class: 'chooser-item', onclick: () => setProgram(o.value) }, o.label)),
        ])));
}

// ── Cloud sync (enabled when assets/firebase-config.js provides a Firebase config) ──
const cloud = { api: null, user: null, timer: null, status: '' };

// Grades and hand-entered credits are sent only when there are any (accounts from before they existed stay valid)
function localProgress() {
    const p = {
        taken: [...state.taken], plan: Object.fromEntries(state.plan),
        program: store.get(PROGRAM_KEY, '') || '', start: state.start, updatedAt: store.get(UPDATED_KEY, 0),
    };
    if (state.grades.size) p.grades = Object.fromEntries(state.grades);
    if (state.manual.size) p.manual = Object.fromEntries(state.manual);
    return p;
}

// First sync of a device with an account: union of passed courses; the newer side wins planned conflicts
function mergeProgress(local, remote) {
    const [older, newer] = (remote.updatedAt || 0) > (local.updatedAt || 0) ? [local, remote] : [remote, local];
    const taken = [...new Set([...(local.taken || []), ...(remote.taken || [])])];
    const plan = Object.fromEntries(Object.entries({ ...(older.plan || {}), ...(newer.plan || {}) })
        .filter(([id]) => !taken.includes(id)));
    const grades = { ...(older.grades || {}), ...(newer.grades || {}) }, manual = { ...(older.manual || {}), ...(newer.manual || {}) };
    return { taken, plan, program: newer.program || older.program || '', start: newer.start || older.start || '', updatedAt: Date.now(),
        ...(Object.keys(grades).length && { grades }), ...(Object.keys(manual).length && { manual }) };
}

function applyProgress(p) {
    state.taken = new Set((p.taken || []).filter(id => typeof id === 'string'));  // may include courses outside the dataset
    state.plan = new Map(Object.entries(p.plan || {}).filter(([id]) => COURSES.has(id) && !state.taken.has(id)));
    // A copy without grades or hand-entered credits (saved by an older version of the site) keeps the local ones
    const grades = 'grades' in p ? p.grades : Object.fromEntries(state.grades);
    const manual = 'manual' in p ? p.manual : Object.fromEntries(state.manual);
    state.grades = new Map(Object.entries(grades || {}).filter(([id, g]) => state.taken.has(id) && typeof g === 'number'));
    state.manual = new Map(Object.entries(manual || {}).filter(([, n]) => typeof n === 'number'));
    store.set(STORAGE_KEY, [...state.taken]);
    store.set(PLAN_KEY, Object.fromEntries(state.plan));
    store.set(GRADES_KEY, Object.fromEntries(state.grades));
    store.set(MANUAL_KEY, Object.fromEntries(state.manual));
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
        cloud.timer = null;
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
    const pending = cloud.timer;
    clearTimeout(pending);
    cloud.timer = null;
    try {
        if (deleteData) await cloud.api.remove();
        else if (pending) await cloud.api.save(localProgress());  // don't lose a change made just before
        await cloud.api.signOut();
    } catch (err) {
        console.error(err);
        alert('הפעולה נכשלה. נסו שוב.');
        return;
    }
    store.set(SYNCED_KEY, null);
    applyProgress({ taken: [], plan: {}, grades: {}, manual: {}, program: '', updatedAt: 0 });
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

// Chips are rebuilt on every change; keyboard focus stays on the same chip
function replaceChips(container, chips) {
    const focused = [...container.children].indexOf(document.activeElement);
    container.replaceChildren(...chips);
    if (focused >= 0) container.children[focused]?.focus();
}

function toggleIn(set, value) {
    set.has(value) ? set.delete(value) : set.add(value);
}

// Faculties: of academic units (unit mode, from the data's meta) and of programs (program mode)
const unitFaculties = () => DATA.meta.faculties || {};
const programFaculty = name => DATA.plans[name]?.faculty || 'אחר';
const facultyOfUnits = () => Object.keys(unitFaculties()).find(f => unitFaculties()[f].some(u => state.depts.has(u)))
    || Object.keys(unitFaculties())[0] || '';

function facultyOptions() {
    if (state.mode === 'unit') return Object.keys(unitFaculties()).map(f => ({ value: f, label: f }));
    const counts = new Map();
    Object.keys(DATA.plans).forEach(n => counts.set(programFaculty(n), (counts.get(programFaculty(n)) || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ value: f, label: `${f} (${n})`, short: f }));
}

function renderChrome() {
    const program = state.mode === 'program', map = !program || (state.program && state.view === 'map');
    document.title = `${inProgram() ? shortProgram(state.program) : program ? 'התואר שלי' : [...state.depts].join(', ') || 'עץ הקורסים'} · עץ הקורסים`;
    document.body.classList.toggle('program', inProgram());
    document.body.classList.toggle('has-progress', state.taken.size + state.plan.size > 0);
    $('modeDept').setAttribute('aria-pressed', String(!program));
    $('modeProgram').setAttribute('aria-pressed', String(program));
    $('deptBar').hidden = program;
    $('programBar').hidden = !program;
    $('programInfoBtn').hidden = !state.program;
    $('viewTabs').hidden = !inProgram();
    [...$('viewTabs').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    $('count').hidden = !map;
    $('filtersBtn').hidden = !map;
    if (!map) { $('filters').hidden = true; $('filtersBtn').setAttribute('aria-expanded', 'false'); }

    $('typeField').hidden = inProgram();
    $('offeredField').hidden = inProgram();
    $('isolatedField').hidden = inProgram();
    $('electivesField').hidden = !inProgram();

    pickers.faculty.set(facultyOptions(), state.faculty);
    replaceChips($('deptBar'), (unitFaculties()[state.faculty] || []).map(d =>
        chip(d, state.depts.has(d), () => { toggleIn(state.depts, d); render(); writeHash(); })));

    const counts = new Map();
    for (const c of COURSES.values()) {
        if (state.depts.has(c.dept) && isOffered(c, state.offered)) counts.set(typeKey(c), (counts.get(typeKey(c)) || 0) + 1);
    }
    replaceChips($('typeChips'), [...MAIN_TYPES, OTHER_TYPE].map(t =>
        chip(t, state.types.has(t), () => { toggleIn(state.types, t); render(); }, counts.get(t) || 0)));

    replaceChips($('offeredChips'), OFFERED.map(([value, label]) =>
        chip(label, state.offered === value, () => { state.offered = value; render(); })));
    $('isolated').checked = state.isolated;
    $('electives').checked = state.electives;
    pickers.program.set(pickers.program.options.filter(o => programFaculty(o.value) === state.faculty), state.program);
    pickers.program.el.hidden = !program;
    const years = Object.keys(DATA.plans[state.program]?.previous || {}).sort().reverse();
    pickers.start.el.hidden = !inProgram() || !years.length;
    pickers.start.set([String(DATA.meta.catalog_year), ...years].map((y, i) => ({ value: i ? y : '', label: `התחלתי ב${hebrewYear(+y + 1)}` })),
        years.includes(state.start) ? state.start : '');

    const changed = inProgram() ? Number(state.electives !== DEFAULTS.electives)
        : Number(state.offered !== DEFAULTS.offered) + Number(state.isolated !== DEFAULTS.isolated)
          + Number([...state.types].sort().join() !== [...DEFAULTS.types].sort().join());
    $('filterBadge').hidden = !changed;
    $('filterBadge').textContent = changed;

    const shown = cy.nodes().length;
    $('count').textContent = `${shown} קורסים`;
    $('empty').hidden = shown > 0;
    $('count').title = `שנה״ל ${hebrewYear(DATA.meta.latest_year)} · הנתונים עודכנו ${DATA.meta.generated}`;
    $('dataInfo').textContent = `הנתונים עודכנו ב־${DATA.meta.generated}.`;
    $('gradeScale').textContent = `ממוצע ${GRADE_DOMAIN[0]}–${GRADE_DOMAIN[1]}+`;
    syncPanels();
}

// Program mode ("my degree") or unit mode (browse one academic unit's courses)
function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    if (mode === 'program') {
        if (!state.program && DATA.plans[store.get(PROGRAM_KEY, '')]) state.program = store.get(PROGRAM_KEY, '');
        state.faculty = state.program ? programFaculty(state.program)
            : facultyOptions().find(o => o.value === facultyOfUnits())?.value || facultyOptions()[0]?.value || '';
    } else {
        state.faculty = facultyOfUnits();
    }
    state.selected = null;
    state.info = null;
    renderDetails();
    render();
    writeHash();
}

function setFaculty(faculty) {
    state.faculty = faculty;
    if (state.mode === 'unit') state.depts = new Set((unitFaculties()[faculty] || []).slice(0, 1));
    else if (programFaculty(state.program) !== faculty) state.program = '';
    state.selected = null;
    state.info = null;
    renderDetails();
    render();
    writeHash();
}

function setProgram(name) {
    state.program = name && DATA.plans[name] ? name : '';
    if (state.program) {
        state.mode = 'program';
        state.faculty = programFaculty(state.program);
        store.set(PROGRAM_KEY, state.program);
        store.set(UPDATED_KEY, Date.now());
        pushSoon();
    }
    state.selected = null;
    state.info = null;
    renderDetails();
    render();
    writeHash();
}

function setView(v) {
    state.view = VIEWS.includes(v) ? v : 'list';
    renderSheet();
    renderChrome();
    if (state.view === 'map') fitGraph(cy.nodes());
    writeHash();
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
            h('div', { class: 'sub' }, [c.grades && `ממוצע ${c.grades.mean.toFixed(1)}`, c.credits > 0 && `${c.credits} ש״ס`,
                sems.length ? `סמסטר ${sems.join(' + ')}` : 'לא השנה'].filter(Boolean).join(' · ')));
        tip.hidden = false;
        const x = Math.min(Math.max(8, p.x - tip.offsetWidth / 2), cy.width() - tip.offsetWidth - 8);
        const y = p.y - (NODE_H / 2) * cy.zoom() - tip.offsetHeight - 8;
        tip.style.left = `${x}px`;
        tip.style.top = `${y < 8 ? p.y + (NODE_H / 2) * cy.zoom() + 8 : y}px`;
    });
    cy.on('mouseout viewport tap', () => { tip.hidden = true; });
    cy.on('mouseover', 'node', e => e.target.connectedEdges().addClass('peek'));
    cy.on('mouseout', 'node', e => e.target.connectedEdges().removeClass('peek'));
}

function setupControls() {
    const groups = [['חד-חוגיות', /חד[- ]חוגי/], ['דו-חוגיות', /דו[- ]חוגי/], ['משולבות ואחרות', /./]];
    const names = Object.keys(DATA.plans), used = new Set(), options = [];
    for (const [group, re] of groups) {
        const members = names.filter(n => !used.has(n) && re.test(n));
        members.forEach(n => { used.add(n); options.push({ value: n, label: shortProgram(n), group }); });
    }
    pickers.faculty = picker({ id: 'faculty', label: 'פקולטה', onchange: setFaculty });
    pickers.program = picker({ id: 'program', label: 'תוכנית לימודים', search: true, placeholder: 'בחרו תוכנית', onchange: setProgram });
    pickers.program.options = options;
    pickers.start = picker({ id: 'startYear', label: 'שנת התחלת הלימודים', onchange: value => {
        state.start = value;
        store.set(START_KEY, state.start);
        store.set(UPDATED_KEY, Date.now());
        pushSoon();
        state.info = state.info?.type === 'program' ? state.info : null;
        render();
        renderDetails();
        writeHash();
    } });
    $('facultySlot').replaceWith(pickers.faculty.el);
    $('programSlot').replaceWith(pickers.program.el);
    pickers.start.el.title = 'חלים עליך כללי הידיעון של שנת ההתחלה';
    $('startSlot').replaceWith(pickers.start.el);
    $('modeDept').addEventListener('click', () => setMode('unit'));
    $('modeProgram').addEventListener('click', () => setMode('program'));
    [...$('viewTabs').children].forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('programInfoBtn').addEventListener('click', () => showInfo({ type: 'program' }));
    $('emptyReset').addEventListener('click', resetFilters);

    $('isolated').addEventListener('change', e => { state.isolated = e.target.checked; render(); });
    $('electives').addEventListener('change', e => { state.electives = e.target.checked; render(); });
    $('resetBtn').addEventListener('click', resetFilters);

    // Filters open as a dropdown under their button; clicking elsewhere closes it
    $('filtersBtn').addEventListener('click', () => {
        const open = $('filters').hidden;
        $('filters').hidden = !open;
        $('filtersBtn').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('mousedown', e => {
        if (!$('filters').hidden && !e.target.closest('#filters, #filtersBtn')) $('filtersBtn').click();
    });
    $('detailsClose').addEventListener('click', () => select(null));
    $('helpBtn').addEventListener('click', () => $('help').showModal());
    document.addEventListener('keydown', e => {
        const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
        if (e.key === '/' && !typing) { e.preventDefault(); $('search').focus(); }
        if (e.key !== 'Escape' || $('help').open) return;
        if (!$('filters').hidden) { $('filtersBtn').click(); $('filtersBtn').focus(); }
        else if (state.selected || state.info) select(null);
    });
}

// ── URL state: #program=…&view=timeline&course=03661102 | #unit=מתמטיקה ────
function writeHash() {
    const p = new URLSearchParams();
    if (state.mode === 'program') {
        p.set('program', state.program);
        if (state.program && state.start) p.set('start', state.start);
        if (state.program && state.view !== 'list') p.set('view', state.view);
    } else {
        p.set('unit', [...state.depts].join(','));
    }
    if (state.selected) p.set('course', state.selected);
    history.replaceState(null, '', `#${p}`);
}

// No hash (a fresh visit): a returning student sees their degree, anyone else the default unit
function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const remembered = DATA.plans[store.get(PROGRAM_KEY, '')] ? store.get(PROGRAM_KEY, '') : '';
    const legacyPlan = p.has('plan');  // older links opened the planner
    state.mode = p.has('program') || legacyPlan || (!p.has('unit') && !p.has('course') && remembered) ? 'program' : 'unit';
    state.program = DATA.plans[p.get('program')] ? p.get('program') : state.mode === 'program' && !p.has('program') ? remembered : '';
    state.view = VIEWS.includes(p.get('view')) ? p.get('view') : legacyPlan ? 'timeline' : 'list';
    if (/^\d{4}$/.test(p.get('start') || '')) state.start = p.get('start');
    const units = Object.values(unitFaculties()).flat();
    const chosen = (p.get('unit') || '').split(',').filter(u => units.includes(u));
    if (chosen.length) state.depts = new Set(chosen);
    const course = p.get('course');
    const c = course && COURSES.get(course);
    if (c && state.mode === 'unit' && units.includes(c.dept)) {
        state.depts.add(c.dept);
        state.types.add(typeKey(c));
        if (!isOffered(c, state.offered)) state.offered = 'all';
    }
    state.faculty = state.mode === 'program'
        ? (state.program ? programFaculty(state.program) : facultyOptions()[0]?.value || '')
        : facultyOfUnits();
    return c ? course : null;
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

    // The canvas draws with whatever font is loaded at the time
    await Promise.all([500, 600].map(w => document.fonts.load(`${w} 13px ${NODE_FONT}`))).catch(() => {});
    await document.fonts.ready;
    readPalette();
    cy = cytoscape({
        container: $('cy'), style: graphStyle(), layout: { name: 'preset' },
        minZoom: 0.08, maxZoom: 2.5, boxSelectionEnabled: false, autoungrabify: true,
    });
    cy.on('tap', 'node', e => {
        const id = e.target.id();
        select(id);
    });
    cy.on('tap', e => { if (e.target === cy) select(null); });
    cy.on('viewport', placeBands);
    cy.on('resize', drawBands);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readPalette();
        cy.style(graphStyle());
        render({ fit: false });
        renderDetails();  // grade swatches and histogram bars use the new palette
    });

    for (const id of state.plan.keys()) if (!COURSES.has(id)) state.plan.delete(id);
    setupControls();
    setupSearch();
    setupCanvasTools();
    setupCloud();
    const boot = () => {
        const initial = readHash();
        render();
        if (initial) select(initial, { focus: true });
        else renderDetails();
    };
    boot();
    window.addEventListener('hashchange', () => { state.selected = null; boot(); });
    $('status').classList.add('done');
}

document.addEventListener('DOMContentLoaded', main);
