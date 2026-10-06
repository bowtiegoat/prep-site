// PREVIEW ONLY. A pretend database kept in this browser's localStorage, seeded
// with sample data the first time. Dates are stored as {"__ts": iso}.

const KEY = 'prep-preview:db:v3'; // bump when the pretend data changes
const SIGNED_IN = 'prep-preview:signedIn';

export const DEMO_USER = { uid: 'demo-student', email: 'alex.student@example.com', emailVerified: true };
export const ADMIN_USER = { uid: 'demo-admin', email: 'justin@thebowtiegoat.com', emailVerified: true };
export const ADVISOR_USER = { uid: 'demo-advisor', email: 'taylor.morgan@example.com', emailVerified: true };
const WHO = 'prep-preview:who';

// Which pretend account is signed in: the sample student, the advisor, or the admin.
export function currentDemoUser() {
  const who = localStorage.getItem(WHO);
  return who === 'admin' ? ADMIN_USER : who === 'advisor' ? ADVISOR_USER : DEMO_USER;
}
export const setDemoUser = (who) => localStorage.setItem(WHO, who);

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
// Pretend chapter: 15 students across events, with a mix of recent, slipping,
// and missing exam activity so every stoplight color shows up.
const DEMO_STUDENTS = [
  // uid, first, last, event, last active (days ago, null = never), exams [days ago, correct]
  ['demo-student', 'Alex', 'Rivera', 'PSE', 0, [[2, 71]]],
  ['s-maya', 'Maya', 'Patel', 'RMS', 1, [[5, 82], [40, 74]]],
  ['s-ethan', 'Ethan', 'Brooks', 'SEM', 6, [[20, 64]]],
  ['s-sofia', 'Sofia', 'Nguyen', 'AAM', 33, [[45, 58]]],
  ['s-liam', 'Liam', 'Carter', 'MCS', null, []],
  ['s-ava', 'Ava', 'Thompson', 'STDM', 2, [[3, 77]]],
  ['s-noah', 'Noah', 'Kim', 'STDM', 12, [[25, 61]]],
  ['s-chloe', 'Chloe', 'Martinez', 'BTDM', 4, [[10, 69]]],
  ['s-jackson', 'Jackson', 'Reed', 'BTDM', 21, []],
  ['s-emma', 'Emma', 'Wilson', 'IMCP', 1, [[8, 85], [30, 79]]],
  ['s-lucas', 'Lucas', 'Garcia', 'IMCP', 9, [[33, 55]]],
  ['s-harper', 'Harper', 'Davis', 'IMCP', 15, []],
  ['demo-student-2', 'Jordan', 'Lee', 'ACT', 3, []],
  ['s-mia', 'Mia', 'Robinson', 'PBM', 7, []],
  ['s-owen', 'Owen', 'Hughes', 'BLTDM', null, []],
];
const DEMO_EXAMS = ['marketing-25-26-districts-1322', 'marketing-24-25-states-1309', 'marketing-25-26-states-1329', 'marketing-24-25-districts-1302'];

export async function seed({ joined }) {
  const exams = await (await fetch('/mock/data/exams.json')).json();
  const stats = await (await fetch('/mock/data/stats.json')).json();
  const answerKeys = await keys();
  const { EVENTS } = await import('/js/events.js');
  const { grade, summarize } = await import('/mock/grading.js');
  db = { exams: {}, examStats: {}, users: {}, attempts: {}, schools: {}, teams: {}, advisors: {}, settings: {} };
  exams.forEach((e) => { db.exams[e.id] = e; });
  Object.entries(stats).forEach(([id, s]) => { db.examStats[id] = s; });
  db.schools['demo-school'] = { name: 'BowtieGOAT Academy', state: 'PA', active: true };
  db.schoolCodes = { 'demo-school': { code: 'DEMO' } };
  db.advisors[ADVISOR_USER.email] = { name: 'Taylor Morgan', email: ADVISOR_USER.email, schoolId: 'demo-school' };
  db.advisors['jamie.cruz@example.com'] = { name: 'Jamie Cruz', email: 'jamie.cruz@example.com', schoolId: 'demo-school' };

  const daysAgo = (n) => new Date(Date.now() - n * 86400000);
  DEMO_STUDENTS.forEach(([uid, firstName, lastName, code, active, taken]) => {
    if (uid === DEMO_USER.uid && !joined) return;
    const event = EVENTS.find((e) => e.code === code);
    db.users[uid] = {
      role: 'student', firstName, lastName, email: `${firstName.toLowerCase()}.student@example.com`,
      schoolId: 'demo-school', schoolName: 'BowtieGOAT Academy',
      eventCode: code, eventName: event.event, cluster: event.cluster, track: 1,
      eventHistory: [{ eventCode: code, track: 1, at: timestamp(daysAgo(60)) }],
      ...(active == null ? {} : { lastActiveDate: daysAgo(active).toLocaleDateString('en-CA') }),
    };
    taken.forEach(([ago, correct], i) => {
      const examId = DEMO_EXAMS[i];
      const key = answerKeys[examId];
      // Miss (100 - correct) questions spread through the test.
      const wrong = new Set(key.filter((_, n) => ((n * 37 + i * 11) % 100) < 100 - correct).map((k) => k.q));
      const graded = grade(key, key.map((k) => (wrong.has(k.q) ? (k.answer === 'A' ? 'B' : 'A') : k.answer)));
      db.attempts[`${uid}_1_${examId}`] = {
        uid, track: 1, examId, examLabel: db.exams[examId].label, examSubtitle: db.exams[examId].subtitle,
        cluster: event.cluster, eventCode: code, schoolId: 'demo-school',
        answers: graded.answers, correct: graded.correct, total: graded.total, missed: graded.missed,
        countsForStats: true, statsAtSubmit: summarize(db.examStats[examId], graded.correct),
        startedAt: timestamp(new Date(daysAgo(ago).getTime() - 80 * 60000)), submittedAt: timestamp(daysAgo(ago)),
      };
    });
  });
  // One team already formed; the Buying and Merchandising pair is left for the advisor to try.
  db.teams['demo-team-1'] = { schoolId: 'demo-school', eventCode: 'STDM', memberUids: ['s-ava', 's-noah'], createdBy: ADVISOR_USER.email };
  save();
  return db;
}

// A small bar on every page so the preview is never mistaken for the live site.
export function previewBar() {
  if (document.querySelector('[data-preview-bar]')) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-preview-bar', '');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:100;background:#7d5c33;color:#fff;font:13px Inter,system-ui,sans-serif;padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;justify-content:center';
  const who = currentDemoUser();
  const pick = (key, label, user) => `<button data-be="${key}" style="${who === user ? 'font-weight:700;background:#fff;color:#5f4526;border-radius:999px;padding:1px 10px' : 'text-decoration:underline'}">${label}</button>`;
  bar.innerHTML = `
    <strong>🔧 Preview: pretend data, not the live site</strong>
    <span>Be: ${pick('student', 'Student (Alex)', DEMO_USER)} ${pick('advisor', 'Advisor (Taylor)', ADVISOR_USER)} ${pick('admin', 'Admin (you)', ADMIN_USER)}</span>
    <button data-reset style="text-decoration:underline">Reset pretend data</button>
    <button data-new style="text-decoration:underline">Sign up as a new student</button>
    <span style="opacity:.8">School code: <strong>DEMO</strong></span>`;
  const home = { student: '/eventhub.html', advisor: '/advisor.html', admin: '/admin.html' };
  bar.querySelectorAll('[data-be]').forEach((b) => {
    b.onclick = () => {
      setDemoUser(b.dataset.be);
      setSignedIn(true);
      sessionStorage.clear();
      location.href = home[b.dataset.be];
    };
  });
  bar.querySelector('[data-reset]').onclick = async () => {
    await seed({ joined: true });
    setSignedIn(true);
    sessionStorage.clear();
    clearDrafts();
    location.href = home[localStorage.getItem(WHO) || 'student'];
  };
  bar.querySelector('[data-new]').onclick = async () => { await seed({ joined: false }); setDemoUser('student'); setSignedIn(false); sessionStorage.clear(); clearDrafts(); location.href = '/index.html'; };
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '56px';
}

function clearDrafts() {
  Object.keys(localStorage).filter((k) => k.startsWith('prep:draft:')).forEach((k) => localStorage.removeItem(k));
}
