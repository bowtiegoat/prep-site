// The 8-week Districts prep plan for role play events. No Firebase calls:
// pages pass in the student's data, and this works out each task's status.
//
// - Weeks run Monday to Sunday. Week 8 ends on the Sunday before the
//   student's first competition; the days after are their own review time.
// - Exams and role plays check themselves off. Other tasks are checkboxes
//   saved on the student's account (users/{uid}.planChecks).
// - A task is overdue once its week has ended. Advisors' stoplight:
//   green = caught up, yellow = 1-2 overdue, red = 3+.

import { EVENTS } from './events.js';

const DAY = 86400000;
const WEEKS = 8;
// Exam years for weeks 1, 3, 5, 6, 7, 8 (oldest to newest). PFL only has
// District exams from 22-23, so it repeats its first two exams at the end.
const EXAM_WEEKS = [1, 3, 5, 6, 7, 8];
const EXAM_YEARS = ['20-21', '21-22', '22-23', '23-24', '24-25', '25-26'];
const PFL_YEARS = ['22-23', '23-24', '24-25', '25-26', '22-23', '23-24'];
const ROLE_PLAY_WEEKS = [2, 4, 5, 7, 8]; // role plays #4 and #5 at full timing
const ADULT_JUDGES = ['Teacher or advisor', 'Parent or family member', 'Alum or business professional'];

const ymd = (date) => date.toLocaleDateString('en-CA');
const atNoon = (day) => new Date(`${day}T12:00`);
const addDays = (day, n) => ymd(new Date(atNoon(day).getTime() + n * DAY));

export function shortDate(day) {
  return atNoon(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function planApplies(eventCode) {
  return EVENTS.find((e) => e.code === eventCode)?.type === 'Role Play';
}

// Monday-to-Sunday weeks ending the Sunday before the competition.
export function planWeeks(competitionDate) {
  const comp = atNoon(competitionDate);
  const back = comp.getDay() === 0 ? 7 : comp.getDay(); // days back to the Sunday before
  const lastSunday = ymd(new Date(comp.getTime() - back * DAY));
  const firstMonday = addDays(lastSunday, -(WEEKS * 7 - 1));
  return Array.from({ length: WEEKS }, (_, i) => ({
    number: i + 1,
    start: addDays(firstMonday, i * 7),
    end: addDays(firstMonday, i * 7 + 6),
  }));
}

// All tasks in the plan, before checking what's done.
export function planTasks({ eventCode, cluster, exams }) {
  const event = EVENTS.find((e) => e.code === eventCode);
  const team = Number(String(event?.competitors || '1').split('-').pop()) > 1;
  const timing = team ? '30 + 15' : '10 + 10';
  const years = cluster === 'Personal Financial Literacy' ? PFL_YEARS : EXAM_YEARS;
  const tasks = [];
  const add = (week, id, kind, label, extra = {}) => tasks.push({ week, id, kind, label, ...extra });

  add(1, 'guidelines', 'check', 'Read your event guidelines', { link: 'guidelines' });
  add(1, 'rubric', 'check', "Learn the judge's rubric: the 4 levels and where the 100 points go");
  const seen = new Map();
  EXAM_WEEKS.forEach((week, i) => {
    const exam = exams.find((e) => e.cluster === cluster && e.level === 'Districts' && e.year === years[i]);
    if (!exam) return;
    const tryNumber = (seen.get(exam.id) || 0) + 1; // PFL's second pass is a retake
    seen.set(exam.id, tryNumber);
    add(week, `exam-${week}`, 'exam', `${tryNumber > 1 ? 'Retake' : 'Take'} the ${exam.label} exam (${exam.subtitle})`, { examId: exam.id, tryNumber });
  });
  ROLE_PLAY_WEEKS.forEach((week, i) => {
    const timed = i >= 3;
    add(week, `roleplay-${i + 1}`, 'roleplay', `Practice and log role play #${i + 1}${timed ? ` at full competition timing (${timing})` : ''}`, { count: i + 1, timedNeeded: Math.max(0, i - 2) });
  });
  [2, 4].forEach((week) => add(week, `review-${week}`, 'check', 'Review your exam results and make study materials', { link: 'results' }));
  [5, 6, 7, 8].forEach((week) => add(week, `update-${week}`, 'check', 'Update your study materials', { link: 'results' }));
  for (let week = 1; week <= WEEKS; week += 1) add(week, `cards-${week}`, 'cards', 'Study PI cards on 3 different days');
  add(7, 'adult-judge', 'judge', 'Have a teacher, parent, or alum judge at least one role play');
  add(8, 'three-areas', 'areas', 'Practice role plays from at least 3 instructional areas');
  add(8, 'retake-weakest', 'retake', 'Retake your weakest exam');
  add(8, 'competition-week', 'check', 'Competition-week checklist: business attire ready, guidelines reread, get some rest');
  // Suggested order within a week: exams, role plays, then the rest.
  const ORDER = { exam: 0, retake: 1, roleplay: 2, judge: 3, areas: 4, check: 5, cards: 6 };
  return tasks.sort((a, b) => a.week - b.week || ORDER[a.kind] - ORDER[b.kind]);
}

// The plan's week for a date (clamped to weeks 1-8).
export function weekOfDate(weeks, day) {
  const week = weeks.find((w) => day >= w.start && day <= w.end);
  if (week) return week.number;
  return day < weeks[0].start ? 1 : weeks.length;
}

// Advisor items (info only) for a student: group 'roleplay', 'prepared' or 'everyone'.
export function advisorItems(items = [], weeks, { rolePlay }) {
  return items
    .filter((it) => it.group === 'everyone' || it.group === (rolePlay ? 'roleplay' : 'prepared'))
    .map((it) => ({ ...it, week: it.date ? weekOfDate(weeks, it.date) : it.week }))
    .sort((a, b) => a.week - b.week || String(a.date || '').localeCompare(String(b.date || '')));
}

// Works out each task's status. attempts = the student's exam attempts
// (current track); logs = their role play logs for this event.
// removed = task ids the school's advisors took off the plan; excused = task
// ids an advisor excused for this student. Both are hidden and not counted.
export function planStatus({
  eventCode, cluster, exams, competitionDate, attempts, logs, checks = {}, removed = [], excused = {}, today = ymd(new Date()),
}) {
  const weeks = planWeeks(competitionDate);
  const allTasks = planTasks({ eventCode, cluster, exams });
  const tasks = allTasks.filter((t) => !removed.includes(t.id) && !excused[t.id]);
  const tries = (examId) => attempts.filter((a) => a.examId === examId).length;
  // A role play counts once it has its "one thing to fix" (logs from before that box existed count too).
  const counted = logs.filter((l) => l.fixNext === undefined || String(l.fixNext).trim());
  const timedCount = counted.filter((l) => l.timed).length;
  const areas = new Set(counted.map((l) => l.ia).filter(Boolean));
  const planStart = weeks[0].start;
  const pflRetakes = tasks.filter((t) => t.kind === 'exam' && t.tryNumber > 1).length;
  const retakesInPlan = attempts.filter((a) => (a.attemptNumber || 1) > 1 && a.submittedAt?.toDate && ymd(a.submittedAt.toDate()) >= planStart).length;
  const firstScores = attempts.filter((a) => (a.attemptNumber || 1) === 1 && tasks.some((t) => t.examId === a.examId));
  const weakest = firstScores.sort((a, b) => a.correct / a.total - b.correct / b.total)[0];

  const done = (t) => {
    switch (t.kind) {
      case 'exam': return tries(t.examId) >= t.tryNumber;
      case 'roleplay': return counted.length >= t.count && timedCount >= t.timedNeeded;
      case 'judge': return counted.some((l) => ADULT_JUDGES.includes(l.judge));
      case 'areas': return areas.size >= 3;
      case 'retake': return retakesInPlan - pflRetakes >= 1;
      case 'check': return !!checks[t.id];
      default: return false; // cards: not built yet
    }
  };
  const result = tasks.map((t) => {
    const week = weeks[t.week - 1];
    const isDone = done(t);
    const comingSoon = t.kind === 'cards';
    const state = isDone ? 'done' : comingSoon ? 'soon' : today > week.end ? 'overdue' : today >= week.start ? 'due' : 'upcoming';
    const note = t.kind === 'roleplay' ? `${Math.min(counted.length, t.count)} of ${t.count} logged${t.timedNeeded ? ` · ${Math.min(timedCount, t.timedNeeded)} of ${t.timedNeeded} timed` : ''}`
      : t.kind === 'areas' ? `${areas.size} of 3 so far`
        : t.kind === 'retake' && weakest && !isDone ? `Weakest so far: ${weakest.examLabel} (${weakest.correct}/${weakest.total})`
          : '';
    return { ...t, weekStart: week.start, weekEnd: week.end, state, note };
  });
  const current = weeks.find((w) => today >= w.start && today <= w.end);
  const counting = result.filter((t) => t.state !== 'soon');
  const overdue = result.filter((t) => t.state === 'overdue');
  return {
    weeks,
    tasks: result,
    excusedTasks: allTasks.filter((t) => excused[t.id] && !removed.includes(t.id)),
    currentWeek: current?.number || (today < weeks[0].start ? 0 : WEEKS + 1),
    started: today >= weeks[0].start,
    doneCount: counting.filter((t) => t.state === 'done').length,
    totalCount: counting.length,
    overdue,
    stoplight: overdue.length === 0 ? 'green' : overdue.length <= 2 ? 'yellow' : 'red',
  };
}

// The plan as advisors see it for the whole chapter (exam names are generic
// because each cluster has its own exams).
export function planTemplate() {
  const exams = EXAM_YEARS.map((year) => ({ id: `template-${year}`, cluster: 'template', level: 'Districts', year, label: `20${year}`, subtitle: 'District cluster exam' }));
  return planTasks({ eventCode: '', cluster: 'template', exams })
    .map((t) => (t.kind === 'exam' ? { ...t, label: `Take the 20${EXAM_YEARS[EXAM_WEEKS.indexOf(t.week)]} District cluster exam` } : t));
}
