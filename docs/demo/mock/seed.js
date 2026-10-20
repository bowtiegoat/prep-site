// DEMO ONLY: builds the sample school a prospective advisor explores.
//
// Everything is generated in the visitor's browser from today's date, so the
// school is always in week 4 of the 8-week role play plan. Each student follows
// a short scenario (caught up, missing a few tasks, working ahead...), and the
// generator walks that student's real prep plan to create the matching exams,
// role play logs, PI card study, check-offs, and shared links.
//
// Exam answer letters are made up. The PI codes, indicators, and sources are
// real (from DECA's published lists), but no real answer key is ever included.

import { EVENTS } from '../js/events.js';
import { PLANS, planTasks, planType, planWeeks, sharedTaskIds } from '../js/prep-plan.js';
import { grade, summarize, batchFromScores, applyBatch } from './grading.js';

const DAY = 86400000;
const ymd = (d) => d.toLocaleDateString('en-CA');
const atNoon = (day) => new Date(`${day}T12:00`);
const addDays = (day, n) => ymd(new Date(atNoon(day).getTime() + n * DAY));

// Same random numbers on every load, so the demo always tells the same story.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const LETTERS = ['A', 'B', 'C', 'D'];
const LEVELS = ['N', 'D', 'P', 'E'];

// The judge rubric's rows (same keys as js/roleplays.js, which this can't
// import: it loads the site's sign-in code).
function rubricTypeFor(event) {
  if (event.code === 'PFL') return 'pfl';
  if (event.cluster === 'Business Administration Core') return 'principles';
  if (event.type === 'Role Play' && event.competitors === '2') return 'team';
  return 'series';
}
function rubricKeys(type) {
  const pis = type === 'principles' ? 4 : type === 'pfl' ? 3 : 5;
  return [...Array.from({ length: pis }, (_, i) => `pi${i + 1}`), 'unique', 'practical', 'effective', 'critical', 'communication', 'decision', 'overall'];
}
// A made-up answer letter for every question (never DECA's real key).
const fakeAnswer = (examId, q) => LETTERS[hash(`${examId}:${q}`) % 4];

const JUDGES = ['Classmate / DECA member', 'Teacher or advisor', 'Parent or family member', 'Alum or business professional'];
const FEEDBACK = [
  ['Great eye contact and a confident opening. You ran out of time before the last PI.', 'Plan one minute per PI before you walk in.'],
  ['Your solution was practical, but explain WHY it works for this business.', 'Back every idea with a reason and a number.'],
  ['Strong use of the judge\'s name and a clear structure. The close felt rushed.', 'Summarize all the PIs in the close.'],
  ['You covered every PI. Add one creative, unexpected idea to stand out.', 'Bring one original idea the judge hasn\'t heard.'],
  ['Very polished. Your answers to my questions were specific and calm.', 'Keep the same pace when nerves hit.'],
  ['Good ideas, but you read from your notes too much.', 'Use notes for keywords only, not full sentences.'],
  ['Clear and organized. Connect your recommendation to the company\'s goals.', 'Tie the solution back to the scenario\'s goal.'],
];
const AREAS = ['Customer Relations', 'Promotion', 'Market Planning', 'Product/Service Management', 'Economics', 'Selling', 'Operations', 'Professional Development', 'Financial Analysis', 'Communication Skills', 'Emotional Intelligence'];

// The sample chapter. plan: how far along the student is.
//   done: last plan week fully finished (current week is 4 for 8-week plans,
//         12 for the 16-week written plan); missing: task ids left undone;
//   ahead: future task ids already done; now: this week's task ids done.
// exams: [first score %, change per exam]. cards: 'heavy' | 'light'.
const STUDENTS = [
  { id: 'd-avery', first: 'Avery', last: 'Johnson', event: 'AAM', joined: 44, active: 0, exams: [64, 5], rp: 'strong', cards: 'heavy', plan: { done: 3, now: ['roleplay-2', 'review-4'], ahead: ['exam-5', 'roleplay-3'] } },
  { id: 'd-marcus', first: 'Marcus', last: 'Lee', event: 'RMS', joined: 43, active: 1, exams: [70, 1], rp: 'mid', cards: 'light', plan: { done: 3 } },
  { id: 'd-priya', first: 'Priya', last: 'Shah', event: 'SEM', joined: 41, active: 2, exams: [55, 6], rp: 'mid', cards: 'light', plan: { done: 3, missing: ['rubric', 'review-2'] } },
  { id: 'd-jordan', first: 'Jordan', last: 'Brooks', event: 'MCS', joined: 40, active: 0, exams: [52, 0], rp: 'weak', plan: { done: 1, missing: ['rubric'] } },
  { id: 'd-sofia', first: 'Sofia', last: 'Ramirez', event: 'BSM', joined: 42, active: 9, exams: [72, -7], rp: 'weak', plan: { done: 3, missing: ['roleplay-1', 'review-2', 'cards-3'] } },
  { id: 'd-ethan', first: 'Ethan', last: 'Clark', event: 'FMS', joined: 44, active: 1, exams: [58, 8], rp: 'mid', cards: 'light', retake: true, plan: { done: 3, now: ['roleplay-2'] } },
  { id: 'd-liam', first: 'Liam', last: 'Walsh', event: 'ASM', joined: 5, active: 0, exams: [60, 0], rp: 'mid', plan: { done: 0, now: ['roleplay-2'], late: true } },
  { id: 'd-grace', first: 'Grace', last: 'Kim', event: 'ACT', joined: 45, active: 0, exams: [84, 2], rp: 'strong', cards: 'light', plan: { done: 3, now: ['roleplay-2', 'review-4'], ahead: ['exam-5'] } },
  { id: 'd-noah', first: 'Noah', last: 'Patel', event: 'BFS', joined: 39, active: 3, exams: [61, 2], rp: 'mid', plan: { done: 3, missing: ['cards-3'] } },
  { id: 'd-olivia', first: 'Olivia', last: 'Chen', event: 'HLM', joined: 44, active: 0, exams: [69, 4], rp: 'strong', cards: 'heavy', plan: { done: 3, now: ['roleplay-2', 'review-4'], ahead: ['exam-5', 'roleplay-3', 'update-5'] } },
  { id: 'd-mason', first: 'Mason', last: 'Rivera', event: 'HRM', joined: 38, active: null, plan: { done: 0 } },
  { id: 'd-isabella', first: 'Isabella', last: 'Moore', event: 'ENT', joined: 42, active: 2, exams: [67, 3], rp: 'mid', plan: { done: 3 } },
  { id: 'd-ava', first: 'Ava', last: 'Thompson', event: 'PMK', joined: 43, active: 0, exams: [63, 4], rp: 'strong', cards: 'heavy', plan: { done: 3, now: ['roleplay-2', 'cards-4'] } },
  { id: 'd-lucas', first: 'Lucas', last: 'Nguyen', event: 'PBM', joined: 40, active: 4, exams: [57, 3], rp: 'mid', cards: 'light', plan: { done: 3, missing: ['roleplay-1'] } },
  { id: 'd-mia', first: 'Mia', last: 'Robinson', event: 'PHT', joined: 37, active: 12, exams: [49, 0], plan: { done: 1, missing: ['guidelines'] } },
  { id: 'd-chloe', first: 'Chloe', last: 'Davis', event: 'STDM', team: 'stdm', joined: 44, active: 0, exams: [66, 3], rp: 'strong', cards: 'light', plan: { done: 3, now: ['roleplay-2'] } },
  { id: 'd-caleb', first: 'Caleb', last: 'Turner', event: 'STDM', team: 'stdm', joined: 44, active: 1, exams: [59, 4], rp: 'strong', plan: { done: 3, now: ['roleplay-2'] } },
  { id: 'd-owen', first: 'Owen', last: 'Hughes', event: 'BLTDM', joined: 36, active: 6, exams: [54, 1], plan: { done: 2, missing: ['roleplay-1'] } },
  { id: 'd-emma', first: 'Emma', last: 'Wilson', event: 'IMCP', team: 'imc', joined: 46, active: 0, exams: [71, 2], plan: { done: 11, missing: ['w-final', 'w-assurances'] } },
  { id: 'd-harper', first: 'Harper', last: 'Lewis', event: 'IMCP', team: 'imc', joined: 46, active: 3, exams: [62, 3], plan: { done: 11, missing: ['w-final', 'w-assurances'] } },
  { id: 'd-zoe', first: 'Zoe', last: 'Martinez', event: 'EIP', joined: 47, active: 0, plan: { done: 11, now: ['w-pres-outline-final'] } },
  { id: 'd-daniel', first: 'Daniel', last: 'Ortiz', event: 'BOR', joined: 45, active: 15, plan: { done: 6, missing: ['w-graphic'] } },
  { id: 'd-nora', first: 'Nora', last: 'Bennett', event: 'PSE', joined: 42, active: 0, exams: [73, 3], plan: { done: 3, now: ['s-pres-changes', 's-materials-start'], ahead: ['s-exam-5', 's-materials-final'] } },
  { id: 'd-henry', first: 'Henry', last: 'Adams', event: 'VBCAC', joined: 30, active: 5 },
  // A duplicate account the advisor already archived.
  { id: 'd-avery2', first: 'Avery', last: 'Johnson', event: 'AAM', joined: 44, active: 44, archived: true, email: 'avery.j.2@example.com' },
];
const TEAMS = { stdm: { eventCode: 'STDM' }, imc: { eventCode: 'IMCP' } };
// Exam clusters used by the sample chapter.
const CORE_ONLY = new Set(['CM', 'IM', 'MP', 'PI', 'PM', 'PR', 'SE']);
const YEARS = ['20-21', '21-22', '22-23', '23-24', '24-25', '25-26'];

export function buildDemo(data, now = new Date()) {
  const random = rng(20261020);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const today = ymd(now);
  const stamp = (day, minutes = 0) => {
    const d = new Date(`${day}T15:30`);
    d.setMinutes(d.getMinutes() + minutes);
    const at = d > now ? new Date(now.getTime() - 60000) : d;
    return { __ts: at.toISOString() };
  };
  const daysAgo = (n) => addDays(today, -n);

  // ---------- Dates: always week 4 of the 8-week plan ----------
  const monday = addDays(today, -((now.getDay() + 6) % 7));
  const district = addDays(monday, 40); // Saturday of week 9, so this week is week 4 of 8
  const state = addDays(district, 70);
  const dates = { district, state, noDistrict: false, preparedFirstAt: 'district', updatedBy: 'demo', updatedAt: stamp(daysAgo(30)) };
  const cardsSince = addDays(monday, -7); // PI cards "went live" at the start of week 3

  const db = {
    exams: {}, examStats: {}, examQuestions: {}, users: {}, attempts: {}, schools: {}, schoolCodes: {}, teams: {}, advisors: {},
    settings: {}, roleplayLogs: {}, flags: {}, flashDecks: {}, cardProgress: {},
  };
  db.schools['demo-school'] = { name: 'GOAT Academy (Demo)', state: 'PA', active: true, competitionDates: dates };
  db.schoolCodes['demo-school'] = { code: 'DEMO' };
  db.advisors['taylor.morgan@example.com'] = { name: 'Taylor Morgan', email: 'taylor.morgan@example.com', schoolId: 'demo-school' };
  db.advisors['jamie.cruz@example.com'] = { name: 'Jamie Cruz', email: 'jamie.cruz@example.com', schoolId: 'demo-school' };

  // ---------- Exams (real PIs and sources, made-up answers) ----------
  // Marketing uses its own exams; other clusters get exams built from the
  // Business Administration Core questions every cluster shares.
  const marketing = data.exams.filter((e) => e.cluster === 'Marketing');
  const clusters = [...new Set(STUDENTS.map((s) => EVENTS.find((e) => e.code === s.event)?.cluster).filter(Boolean))];
  clusters.forEach((cluster, ci) => {
    marketing.forEach((src, ei) => {
      // Other clusters only need District exams (the plan uses those).
      if (cluster !== 'Marketing' && src.level !== 'Districts') return;
      const id = cluster === 'Marketing' ? src.id : `${cluster.toLowerCase().replace(/[^a-z]+/g, '-')}-${src.year}-${src.level.toLowerCase()}-${2000 + ci * 100 + ei}`;
      let questions = data.questions[src.id];
      if (cluster !== 'Marketing') {
        const core = questions.filter((q) => !CORE_ONLY.has(String(q.code).split(':')[0]));
        questions = Array.from({ length: 100 }, (_, i) => ({ ...core[i % core.length], q: i + 1 }));
      }
      const testNumber = cluster === 'Marketing' ? src.testNumber : String(2000 + ci * 100 + ei);
      db.exams[id] = { ...src, id, cluster, testNumber, subtitle: `Test ${testNumber}`, questionCount: questions.length, active: true };
      const answerCounts = { A: 0, B: 0, C: 0, D: 0 };
      questions.forEach((q) => { answerCounts[fakeAnswer(id, q.q)] += 1; });
      db.examQuestions[id] = { cluster, level: src.level, year: src.year, label: src.label, subtitle: `Test ${testNumber}`, questions, answerCounts };
      // Made-up site-wide results so rankings and the deep dive have something to show.
      const takers = 18 + Math.floor(random() * 40);
      const mean = 58 + random() * 10;
      const scores = Array.from({ length: takers }, () => Math.max(20, Math.min(98, Math.round(mean + (random() + random() + random() - 1.5) * 22))));
      const stats = applyBatch(null, batchFromScores(scores, questions.length), 1);
      stats.questionTakers = takers;
      stats.questionCorrect = questions.map(() => Math.round(takers * Math.max(0.15, Math.min(0.97, mean / 100 + (random() - 0.5) * 0.5))));
      db.examStats[id] = stats;
    });
  });
  const examsFor = (cluster) => Object.values(db.exams).filter((e) => e.cluster === cluster);
  const keyFor = (examId) => db.examQuestions[examId].questions.map((q) => ({ ...q, answer: fakeAnswer(examId, q.q) }));

  // ---------- PI card decks (a sample of each) ----------
  Object.entries(data.decks || {}).forEach(([id, deck]) => {
    db.flashDecks[id] = { ...deck, updatedAt: new Date(`${cardsSince}T09:00`).toISOString(), publishedAt: new Date(`${cardsSince}T09:00`).toISOString() };
  });

  // ---------- Students ----------
  const teamDocs = {};
  Object.entries(TEAMS).forEach(([key, t]) => {
    // Teammates are known up front, so the first one's role play logs are already shared.
    const memberUids = STUDENTS.filter((st) => st.team === key).map((st) => st.id);
    teamDocs[key] = { id: `demo-team-${key}`, schoolId: 'demo-school', eventCode: t.eventCode, memberUids, planChecks: {}, planLinks: {}, createdBy: 'taylor.morgan@example.com' };
  });
  let logCount = 0;

  STUDENTS.forEach((s) => {
    const event = EVENTS.find((e) => e.code === s.event);
    const r = rng(hash(s.id));
    const created = daysAgo(s.joined);
    const user = {
      role: 'student', firstName: s.first, lastName: s.last, email: s.email || `${s.first}.${s.last}@example.com`.toLowerCase(),
      schoolId: 'demo-school', schoolName: 'GOAT Academy (Demo)', eventCode: event.code, eventName: event.event, cluster: event.cluster, track: 1,
      eventHistory: [{ eventCode: event.code, track: 1, at: stamp(created) }], createdAt: stamp(created),
      planChecks: {}, planLinks: {}, ...(s.archived ? { archived: true, archivedAt: new Date(`${daysAgo(10)}T12:00`).toISOString(), archivedBy: 'Taylor Morgan' } : {}),
      ...(s.plan?.late ? {} : { planLateHandled: true }),
    };
    db.users[s.id] = user;
    let lastWork = null;
    const worked = (day) => { if (!lastWork || day > lastWork) lastWork = day; };
    const team = s.team ? teamDocs[s.team] : null;
    const shared = sharedTaskIds(event.code);

    // Exams: one score per exam taken, moving by the scenario's change each time.
    let examIndex = 0;
    const [startScore, step] = s.exams || [60, 1];
    const takeExam = (exam, day, tryNumber = 1, pctOverride = null) => {
      const target = pctOverride ?? Math.max(30, Math.min(96, Math.round(startScore + step * examIndex + (r() - 0.5) * 6)));
      examIndex += 1;
      const key = keyFor(exam.id);
      const wrong = new Set(key.map((k) => k.q).sort(() => r() - 0.5).slice(0, key.length - Math.round(key.length * target / 100)));
      const answers = key.map((k) => (wrong.has(k.q) ? LETTERS[(LETTERS.indexOf(k.answer) + 1 + Math.floor(r() * 3)) % 4] : k.answer));
      const graded = grade(key, answers);
      const id = `${s.id}_1_${exam.id}${tryNumber > 1 ? `_${tryNumber}` : ''}`;
      db.attempts[id] = {
        uid: s.id, track: 1, examId: exam.id, attemptNumber: tryNumber, examLabel: exam.label, examSubtitle: exam.subtitle,
        cluster: exam.cluster, eventCode: event.code, schoolId: 'demo-school',
        answers: graded.answers, correct: graded.correct, total: graded.total, missed: graded.missed,
        countsForStats: true, statsAtSubmit: summarize(db.examStats[exam.id], graded.correct),
        startedAt: stamp(day, -80), submittedAt: stamp(day),
      };
      worked(day);
    };

    // Role play logs (shared by a team): levels improve over time; quality sets the starting point.
    const logs = () => Object.values(db.roleplayLogs).filter((l) => l.memberUids.includes(s.id));
    const logRolePlay = (day, { timed = false, adult = false } = {}) => {
      const rubric = rubricTypeFor(event);
      const rows = rubricKeys(rubric).map((key) => ({ key }));
      const n = logs().length;
      const base = { strong: 1.4, mid: 0.9, weak: 0.4 }[s.rp || 'mid'] + n * 0.45;
      const levels = Object.fromEntries(rows.map((row) => [row.key, LEVELS[Math.max(0, Math.min(3, Math.round(base + (r() - 0.5) * 1.4)))]]));
      const [feedback, fixNext] = FEEDBACK[(hash(s.id) + n) % FEEDBACK.length];
      const id = `d-log-${(logCount += 1)}`;
      db.roleplayLogs[id] = {
        memberUids: team ? [...team.memberUids] : [s.id], teamId: team?.id || null, schoolId: 'demo-school', eventCode: event.code, rubric, date: day,
        source: 'deca', goatFile: null, title: `DECA ${event.code} ${2022 + (n % 4)} District Event ${1 + (n % 2)}`, url: 'https://www.deca.org/resources',
        ia: AREAS[(hash(s.id) + n) % AREAS.length], pis: null, levels,
        score: Math.round(45 + base * 14 + r() * 6), videoUrl: '', judge: adult || n % 2 ? pick(JUDGES.slice(1)) : JUDGES[0],
        feedback, fixNext, timed, createdBy: s.id, createdByName: `${s.first} ${s.last}`,
        createdAt: stamp(day), updatedAt: stamp(day),
      };
      worked(day);
    };

    // PI cards: study days of 10+ cards, plus a record of which PIs were missed.
    const deckId = Object.keys(db.flashDecks).find((id) => db.flashDecks[id].events.includes(event.code));
    const progress = deckId && event.type === 'Role Play' ? (db.cardProgress[s.id] = { schoolId: 'demo-school', sessions: {}, stats: {}, studyDays: {} }) : null;
    const study = (day, cards) => {
      if (!progress || day > today) return;
      progress.studyDays[day] = (progress.studyDays[day] || 0) + cards;
      worked(day);
    };

    // ---------- Walk the prep plan ----------
    const type = planType(event.code);
    if (type && s.plan) {
      const weeks = planWeeks(district, PLANS[type].weeks); // prepared events also start at District here
      const current = weeks.find((w) => today >= w.start && today <= w.end)?.number || 1;
      const tasks = planTasks({ eventCode: event.code, cluster: event.cluster, exams: examsFor(event.cluster) });
      const missing = new Set(s.plan.missing || []);
      const doneIds = new Set([
        ...tasks.filter((t) => t.week <= Math.min(s.plan.done, current - 1) && !missing.has(t.id)).map((t) => t.id),
        ...(s.plan.now || []), ...(s.plan.ahead || []),
      ]);
      // A late joiner only did this week's work; their earlier weeks are still open.
      const ordered = tasks.filter((t) => doneIds.has(t.id)).sort((a, b) => a.week - b.week);
      ordered.forEach((t) => {
        const week = weeks[Math.min(t.week, current) - 1];
        const offset = Math.floor(r() * 5);
        let day = addDays(week.start, offset);
        if (t.week >= current || day > today) day = addDays(today, -Math.floor(r() * Math.max(1, (now.getDay() + 6) % 7 + 1)));
        if (s.plan.late && day < created) day = today;
        const target = t.shared && team ? team : user;
        switch (t.kind) {
          case 'check': target.planChecks[t.id] = day; worked(day); break;
          case 'link': {
            const entry = { url: `https://docs.google.com/document/d/demo-${s.id}-${t.id}`, by: s.id, byName: `${s.first} ${s.last}`, at: `${day}T19:00:00.000Z` };
            target.planLinks[t.id] = [...(target.planLinks[t.id] || []), entry];
            worked(day);
            break;
          }
          case 'exam': takeExam(db.exams[t.examId], day); break;
          case 'roleplay':
            while (logs().length < t.count) logRolePlay(day, { timed: t.timedNeeded > 0, adult: t.count >= 2 });
            break;
          case 'cards':
            if (week.end >= cardsSince) [0, 1, 3].forEach((k, i) => study(addDays(week.start, k) > today ? addDays(today, -i) : addDays(week.start, k), 12 + Math.floor(r() * 25)));
            break;
          default: break;
        }
      });
      // A retake of the first exam, to show tries.
      if (s.retake) {
        const first = Object.values(db.attempts).filter((a) => a.uid === s.id).sort((a, b) => a.submittedAt.__ts.localeCompare(b.submittedAt.__ts))[0];
        if (first) takeExam(db.exams[first.examId], daysAgo(2), 2, Math.round(first.correct * 100 / first.total) + 13);
      }
    }

    // Heavy and light card studiers also studied this week.
    if (progress && s.cards) {
      const extra = s.cards === 'heavy' ? 46 : 14;
      study(today, extra);
      const deck = db.flashDecks[deckId];
      const district = deck.cards.filter((c) => c.districts.includes(event.code));
      const studied = (s.cards === 'heavy' ? deck.cards.slice(0, 60) : district.slice(0, 12));
      studied.forEach((c, i) => { progress.stats[c.code] = { seen: 1 + (i % 3), missed: (hash(c.code + s.id) % 5 === 0) ? 1 + (i % 3) : (hash(c.code) % 7 === 0 ? 1 : 0) }; });
      Object.values(progress.stats).forEach((st) => { st.missed = Math.min(st.missed, st.seen); });
      const codes = district.map((c) => c.code);
      const known = codes.slice(0, Math.floor(codes.length * (s.cards === 'heavy' ? 0.6 : 0.25)));
      progress.sessions.district = { id: 'demo', eventCode: event.code, pile: codes.filter((c) => !known.includes(c)), known, seen: codes.slice(0, known.length + 3), missed: codes.slice(known.length, known.length + 2), startedAt: new Date(`${daysAgo(3)}T18:00`).toISOString() };
    }

    if (s.active != null) user.lastActiveDate = s.active === 0 ? today : (lastWork && lastWork > daysAgo(s.active) ? lastWork : daysAgo(s.active));
    if (!user.planLateHandled && !s.plan?.late) user.planLateHandled = true;
  });

  Object.values(teamDocs).forEach((t) => { db.teams[t.id] = t; });
  // Team logs belong to everyone on the team.
  Object.values(db.roleplayLogs).forEach((l) => {
    if (l.teamId) l.memberUids = [...Object.values(teamDocs).find((t) => t.id === l.teamId).memberUids];
  });
  return db;
}
