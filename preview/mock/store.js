// PREVIEW ONLY. A pretend database kept in this browser's localStorage, seeded
// with sample data the first time. Dates are stored as {"__ts": iso}.

const KEY = 'prep-preview:db';
const SIGNED_IN = 'prep-preview:signedIn';

export const DEMO_USER = { uid: 'demo-student', email: 'alex.student@example.com', emailVerified: true };

export function timestamp(date) {
  const d = new Date(date);
  return { __ts: d.toISOString(), toDate: () => d, toMillis: () => d.getTime() };
}

function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if ('__ts' in value) return timestamp(value.__ts);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? revive(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

let db = load();

export async function ready() {
  if (!db) db = await seed({ joined: true });
  return db;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function table(name) {
  db[name] = db[name] || {};
  return db[name];
}

export const isSignedIn = () => localStorage.getItem(SIGNED_IN) !== 'no';
export const setSignedIn = (yes) => localStorage.setItem(SIGNED_IN, yes ? 'yes' : 'no');

export async function keys() {
  return (await fetch('/mock/data/keys.json')).json();
}

// Sample data: the real exam list, made-up site-wide stats, and (optionally)
// a student who already joined with one exam taken.
export async function seed({ joined }) {
  const exams = await (await fetch('/mock/data/exams.json')).json();
  const stats = await (await fetch('/mock/data/stats.json')).json();
  const answerKeys = await keys();
  db = { exams: {}, examStats: {}, users: {}, attempts: {}, schools: {} };
  exams.forEach((e) => { db.exams[e.id] = e; });
  Object.entries(stats).forEach(([id, s]) => { db.examStats[id] = s; });
  db.schools['demo-school'] = { name: 'BowtieGOAT Academy', state: 'PA', active: true };

  if (joined) {
    db.users[DEMO_USER.uid] = {
      role: 'student', firstName: 'Alex', lastName: 'Rivera', email: DEMO_USER.email,
      schoolId: 'demo-school', schoolName: 'BowtieGOAT Academy',
      eventCode: 'PSE', eventName: 'Professional Selling', cluster: 'Marketing', track: 1,
      eventHistory: [{ eventCode: 'PSE', track: 1, at: timestamp('2026-09-20') }],
    };
    // One exam already taken: wrong on 29 questions spread through the test.
    const examId = 'marketing-25-26-districts-1322';
    const key = answerKeys[examId];
    const wrong = new Set(key.filter((_, i) => (i * 37) % 100 < 29).map((k) => k.q));
    const answers = key.map((k) => (wrong.has(k.q) ? (k.answer === 'A' ? 'B' : 'A') : k.answer));
    const { grade, summarize } = await import('/mock/grading.js');
    const graded = grade(key, answers);
    db.attempts[`${DEMO_USER.uid}_1_${examId}`] = {
      uid: DEMO_USER.uid, track: 1, examId, examLabel: db.exams[examId].label, examSubtitle: db.exams[examId].subtitle,
      cluster: 'Marketing', eventCode: 'PSE', schoolId: 'demo-school',
      answers: graded.answers, correct: graded.correct, total: graded.total, missed: graded.missed,
      countsForStats: true, statsAtSubmit: summarize(db.examStats[examId], graded.correct),
      startedAt: timestamp('2026-10-02T14:05'), submittedAt: timestamp('2026-10-02T15:21'),
    };
  }
  save();
  return db;
}

// A small bar on every page so the preview is never mistaken for the live site.
export function previewBar() {
  if (document.querySelector('[data-preview-bar]')) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-preview-bar', '');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:100;background:#7d5c33;color:#fff;font:13px Inter,system-ui,sans-serif;padding:8px 12px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:center';
  bar.innerHTML = `
    <strong>🔧 Preview on your computer: pretend data, not the live site</strong>
    <span>School code for sign-up: <strong>DEMO</strong></span>
    <button data-reset style="text-decoration:underline">Reset sample student</button>
    <button data-new style="text-decoration:underline">Start as a brand-new student</button>`;
  bar.querySelector('[data-reset]').onclick = async () => { await seed({ joined: true }); setSignedIn(true); clearDrafts(); location.href = '/exams.html'; };
  bar.querySelector('[data-new]').onclick = async () => { await seed({ joined: false }); setSignedIn(false); clearDrafts(); location.href = '/index.html'; };
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '48px';
}

function clearDrafts() {
  Object.keys(localStorage).filter((k) => k.startsWith('prep:draft:')).forEach((k) => localStorage.removeItem(k));
}
