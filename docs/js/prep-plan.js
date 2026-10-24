// Prep plans that count back from a student's first competition. No Firebase
// calls: pages pass in the student's data, and this works out each task's status.
//
// Three plans:
// - roleplay: 8 weeks for role play events (exams, role plays, PI cards).
// - written:  16 weeks for prepared events with a written entry (the paper,
//             then the presentation). Integrated Marketing Campaign events
//             also take the cluster exams.
// - selling:  8 weeks for Professional Selling and Consulting events (no
//             paper): the cluster exams plus building and practicing the presentation.
// - sbeChapter: 12 weeks for School-based Enterprise chapter certification
//             (Gold), counting back to DECA's deadline the admin sets (see
//             competitions.js). The chapter team shares one plan.
// - sbeIndividual: SBE individual certification exam. FIRST DRAFT: placeholder
//             tasks until the BowtieGOAT timeline is written.
//
// - Weeks run Monday to Sunday. The last week ends on the Sunday before the
//   student's first competition; the days after are their own review time.
// - Exams, role plays, and links check themselves off. Other tasks are
//   checkboxes saved on the student's account (users/{uid}.planChecks), or on
//   their team (teams/{id}.planChecks) for tasks the team shares.
// - A task is overdue once its week has ended. Advisors' stoplight:
//   green = caught up, yellow = 1-2 overdue, red = 3+.

import { EVENTS, isChapterTeamEvent, takesExam } from './events.js';
import { studyDaysBetween } from './flashcards.js';

const DAY = 86400000;
// Exam years, oldest to newest. PFL only has District exams from 22-23, so
// it repeats its first two exams at the end.
const EXAM_YEARS = ['20-21', '21-22', '22-23', '23-24', '24-25', '25-26'];
const PFL_YEARS = ['22-23', '23-24', '24-25', '25-26', '22-23', '23-24'];
const ADULT_JUDGES = ['Teacher or advisor', 'Parent or family member', 'Alum or business professional'];
const SELLING_EVENTS = new Set(['PSE', 'FCE', 'HTPS']);

export const PLANS = {
  roleplay: { weeks: 8, name: 'Role play events', examWeeks: [1, 3, 5, 6, 7, 8] },
  written: { weeks: 16, name: 'Written events', examWeeks: [3, 5, 7, 9, 11, 13] },
  selling: { weeks: 8, name: 'Selling events', examWeeks: [1, 3, 5, 6, 7, 8] },
  sbeChapter: { weeks: 12, name: 'SBE chapter', examWeeks: [] },
  sbeIndividual: { weeks: 6, name: 'SBE individual', examWeeks: [] },
};

const ymd = (date) => date.toLocaleDateString('en-CA');
const atNoon = (day) => new Date(`${day}T12:00`);
const addDays = (day, n) => ymd(new Date(atNoon(day).getTime() + n * DAY));

export function shortDate(day) {
  return atNoon(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Which plan an event follows, or null (virtual events have none).
export function planType(eventCode) {
  const event = EVENTS.find((e) => e.code === eventCode);
  if (event?.type === 'Role Play') return 'roleplay';
  if (event?.type === 'SBE') return isChapterTeamEvent(eventCode) ? 'sbeChapter' : 'sbeIndividual';
  if (event?.type !== 'Prepared') return null;
  return SELLING_EVENTS.has(eventCode) ? 'selling' : 'written';
}

export function planApplies(eventCode) {
  return !!planType(eventCode);
}

// Monday-to-Sunday weeks ending the Sunday before the competition.
export function planWeeks(competitionDate, count = 8) {
  const comp = atNoon(competitionDate);
  const back = comp.getDay() === 0 ? 7 : comp.getDay(); // days back to the Sunday before
  const lastSunday = ymd(new Date(comp.getTime() - back * DAY));
  const firstMonday = addDays(lastSunday, -(count * 7 - 1));
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    start: addDays(firstMonday, i * 7),
    end: addDays(firstMonday, i * 7 + 6),
  }));
}

// The cluster exam tasks, one per exam week. An id prefix keeps each plan's
// exam tasks apart (advisors remove tasks by id for the whole school).
function examTasks(add, { cluster, exams, weeks, prefix }) {
  const years = cluster === 'Personal Financial Literacy' ? PFL_YEARS : EXAM_YEARS;
  const seen = new Map();
  weeks.forEach((week, i) => {
    const exam = exams.find((e) => e.cluster === cluster && e.level === 'Districts' && e.year === years[i]);
    if (!exam) return;
    const tryNumber = (seen.get(exam.id) || 0) + 1; // PFL's second pass is a retake
    seen.set(exam.id, tryNumber);
    add(week, `${prefix}exam-${week}`, 'exam', `${tryNumber > 1 ? 'Retake' : 'Take'} the ${exam.label} exam (${exam.subtitle})`, { examId: exam.id, tryNumber });
  });
}

function rolePlayTasks({ eventCode, cluster, exams }, add) {
  const event = EVENTS.find((e) => e.code === eventCode);
  const team = Number(String(event?.competitors || '1').split('-').pop()) > 1;
  const timing = team ? '30 + 15' : '10 + 10';
  // Team decision making: the team shares these; exams and studying stay each student's own.
  const shared = { shared: true };
  add(1, 'guidelines', 'check', 'Read your event guidelines', { link: 'guidelines', ...shared });
  add(1, 'rubric', 'check', "Learn the judge's rubric: the 4 levels and where the 100 points go", shared);
  examTasks(add, { cluster, exams, weeks: PLANS.roleplay.examWeeks, prefix: '' });
  [2, 4, 5, 7, 8].forEach((week, i) => {
    const timed = i >= 3; // role plays #4 and #5 at full timing
    add(week, `roleplay-${i + 1}`, 'roleplay', `Practice and log role play #${i + 1}${timed ? ` at full competition timing (${timing})` : ''}`, { count: i + 1, timedNeeded: Math.max(0, i - 2), ...shared });
  });
  [2, 4].forEach((week) => add(week, `review-${week}`, 'check', 'Review your exam results and make study materials', { link: 'results' }));
  [5, 6, 7, 8].forEach((week) => add(week, `update-${week}`, 'check', 'Update your study materials', { link: 'results' }));
  for (let week = 1; week <= 8; week += 1) add(week, `cards-${week}`, 'cards', 'Study PI cards on 3 different days');
  add(7, 'adult-judge', 'judge', 'Have a teacher, parent, or alum judge at least one role play', shared);
  add(8, 'three-areas', 'areas', 'Practice role plays from at least 3 instructional areas', shared);
  add(8, 'retake-weakest', 'retake', 'Retake your weakest exam');
  add(8, 'competition-week', 'check', 'Competition-week checklist: business attire ready, guidelines reread, get some rest', shared);
}

// The BowtieGOAT written events timeline. Its weeks count down to the
// competition (its "week 16" is this plan's week 1); every paper and
// presentation task is shared by the team.
function writtenTasks({ eventCode, cluster, exams }, add) {
  const team = Number(String(EVENTS.find((e) => e.code === eventCode)?.competitors || '1').split('-').pop()) > 1;
  const s = { shared: true };
  add(1, 'w-guidelines', 'check', 'Read your event guidelines and the written entry rubric', { link: 'guidelines', ...s });
  add(1, 'w-topic', 'check', 'Choose your topic', s);
  if (team) add(1, 'w-split', 'check', 'Split the sections among your teammates', s);
  add(1, 'w-outline', 'link', 'Create an outline of your event and share the link', { linkLabel: 'Outline', ...s });
  add(1, 'w-outline-meeting', 'check', 'Meet with your advisor at least once about your outline', s);
  add(2, 'w-research', 'check', 'Do your research (surveys, interviews, numbers)', s);
  add(2, 'w-first-sections', 'check', 'Write your first sections', s);
  add(3, 'w-remaining', 'check', 'Write the remaining sections', s);
  add(4, 'w-draft', 'link', 'Finish a full rough draft in Google Docs or Word and share the link', { linkLabel: 'Rough draft', ...s });
  add(5, 'w-self-score', 'check', 'Score your own draft with the written entry rubric while your advisor reviews it', s);
  add(6, 'w-comments', 'check', "Review your advisor's comments", s);
  add(6, 'w-content', 'check', 'Finish your content. From here on: reviewing, formatting, and needed changes', s);
  add(7, 'w-graphic', 'link', 'Move your paper into the graphical format of your choice and share the link', { linkLabel: 'Graphical version', ...s });
  add(8, 'w-format', 'check', 'Formatting check: page limit, required sections, and sources cited, per the guidelines', { link: 'guidelines', ...s });
  add(9, 'w-finalize', 'check', 'Finalize any changes to your written paper', s);
  add(10, 'w-final', 'link', 'Share the final PDF of your paper', { linkLabel: 'Final paper (PDF)', ...s });
  add(10, 'w-assurances', 'check', "Sign this year's DECA Written Statement of Assurances", s);
  add(11, 'w-pres-outline', 'check', 'Study the presentation rubric and outline how you will present your work', s);
  add(12, 'w-pres-outline-final', 'check', 'Finalize your presentation outline', s);
  add(12, 'w-practice-advisor', 'check', 'Practice your presentation with your advisor (notes, no visuals)', s);
  add(13, 'w-pres-changes', 'check', "Make any changes to your presentation's content", s);
  add(13, 'w-materials-start', 'check', 'Start building your presentation materials', s);
  add(14, 'w-materials-final', 'check', 'Finalize your presentation materials', s);
  add(14, 'w-practice-cards', 'check', 'Practice your presentation with notecards and your materials', s);
  add(14, 'w-schedule-run', 'check', 'Schedule a practice presentation with another person', s);
  add(14, 'w-judge-questions', 'check', 'Write 5 questions a judge might ask, and your answers', s);
  add(15, 'w-memorize', 'check', 'Memorize your presentation', s);
  add(15, 'w-materials-done', 'check', 'Finish all presentation materials', s);
  add(15, 'w-full-timing', 'check', 'Do one run at full competition timing', s);
  add(16, 'w-three-runs', 'check', 'Practice at least 3 times with 3 different people. Make only small changes now', s);
  add(16, 'w-competition-week', 'check', 'Competition-week checklist: business attire ready, materials packed, guidelines reread, get some rest', s);
  // Integrated Marketing Campaign events also take the cluster exam (each student's own).
  if (takesExam(eventCode)) {
    examTasks(add, { cluster, exams, weeks: PLANS.written.examWeeks, prefix: 'w-' });
    [4, 8].forEach((week) => add(week, `w-review-${week}`, 'check', 'Review your exam results and make study materials', { link: 'results' }));
    add(15, 'w-retake-weakest', 'retake', 'Retake your weakest exam');
  }
}

// Professional Selling and Consulting: no paper, so the presentation steps
// from the written timeline plus the cluster exams. Individual events.
function sellingTasks({ cluster, exams }, add) {
  add(1, 's-guidelines', 'check', 'Read your event guidelines and the presentation rubric', { link: 'guidelines' });
  add(2, 's-pres-outline', 'check', 'Outline how you will present, following the guidelines', { link: 'guidelines' });
  add(3, 's-pres-outline-final', 'check', 'Finalize your presentation outline');
  add(3, 's-practice-advisor', 'check', 'Practice your presentation with your advisor (notes, no visuals)');
  add(4, 's-pres-changes', 'check', "Make any changes to your presentation's content");
  add(4, 's-materials-start', 'check', 'Start building your presentation materials');
  add(5, 's-materials-final', 'check', 'Finalize your presentation materials');
  add(5, 's-practice-cards', 'check', 'Practice your presentation with notecards and your materials');
  add(5, 's-schedule-run', 'check', 'Schedule a practice presentation with another person');
  add(5, 's-judge-questions', 'check', 'Write 5 questions a judge might ask, and your answers');
  add(6, 's-memorize', 'check', 'Memorize your presentation');
  add(6, 's-full-timing', 'check', 'Do one run at full competition timing');
  add(8, 's-three-runs', 'check', 'Practice at least 3 times with 3 different people. Make only small changes now');
  add(8, 's-competition-week', 'check', 'Competition-week checklist: business attire ready, materials packed, guidelines reread, get some rest');
  examTasks(add, { cluster, exams, weeks: PLANS.selling.examWeeks, prefix: 's-' });
  [2, 4].forEach((week) => add(week, `s-review-${week}`, 'check', 'Review your exam results and make study materials', { link: 'results' }));
  [5, 6, 7].forEach((week) => add(week, `s-update-${week}`, 'check', 'Update your study materials', { link: 'results' }));
  add(8, 's-retake-weakest', 'retake', 'Retake your weakest exam');
}

// SBE chapter certification, planned for Gold (every performance indicator,
// rated Proficient or above). Built from DECA's 2026-27 Chapter Certification
// Guidelines and its sample Gold retail manual. The whole chapter team shares
// every task. Weeks 6 and 10-11 are lighter (Thanksgiving, winter break).
// link: a key in SBE_LINKS (sbe.js). detail: lines shown under the task.
const SBE_EVIDENCE = 'For each indicator: what students decided and did, a real example, and a chart, photo, or record.';
const SBE_STANDARDS = [
  // [week, number, name, indicators, extra detail]
  [4, 1, 'Financial Analysis', ['Role of finance in business', 'Need for financial information', 'Nature of budgets', 'Responsible financial decisions', 'Maintaining financial records', 'Technology for financial information'], 'Required: a copy of the SBE budget and copies of financial records.'],
  [4, 2, 'Operations', ['Open/close register or terminal', 'Equipment, tools, and machinery', 'Health and safety regulations', 'Routine security precautions']],
  [5, 3, 'Marketing-Information Management', ['Need for marketing data', 'Data monitored for marketing decisions', 'Tracking trends', 'Analyzing customer behavior']],
  [5, 4, 'Market Planning', ['Customer profile (demographics and psychographics, average spend)', 'Market analysis', 'Linking performance measures to financial outcomes']],
  [6, 5, 'Product/Service Management', ['Components of a retail image', 'Choosing vendors', 'Planning merchandise assortment', 'Stock turnover', 'Planning reductions (markdowns, discounts, shortages)']],
  [6, 6, 'Pricing', ['Nature and scope of the pricing function', 'Factors affecting pricing decisions'], 'Show real break-even, ROI, and markup examples.'],
  [7, 7, 'Distribution/Channel Management', ['Customer service and distribution', 'The receiving process', 'Inventory counts', 'Inventory shrinkage']],
  [7, 8, 'Promotion', ['Promotional plan (objectives and budget)', 'Visual merchandising', 'Cross-merchandising', 'Special events', 'Tracking marketing-communications activities']],
  [8, 9, 'Selling', ['Determining customer needs', 'Building customer relationships', 'Suggestion selling', 'Sales documentation (a typical transaction)', 'Returns and exchanges']],
  [8, 10, 'Human Resources Management', ['Nature of HR management (hiring, training, motivating, keeping employees)', 'A positive environment for employees', 'Training staff', 'Assessing employee performance']],
];

function sbeChapterTasks(add) {
  const s = { shared: true };
  // Week 1: kickoff
  add(1, 'sbe-guidelines', 'check', "Read this year's chapter certification guidelines together", { link: 'guidelines', ...s });
  add(1, 'sbe-sample', 'check', "Read DECA's sample Gold manual and note the evidence each standard uses", { link: 'sample', ...s });
  add(1, 'sbe-category', 'check', 'Confirm your category: Food Operations or Retail Operations', { detail: ['Food: food or drinks are most of your items or sales.', 'Retail: merchandise or a service is most of your items or sales.'], ...s });
  add(1, 'sbe-owners', 'check', 'Give each of the 10 standards an owner on your team', s);
  // Week 2: set up
  add(2, 'sbe-template', 'link', 'Set up your manual template and share the link', {
    linkLabel: 'Manual template',
    detail: ['Title page, one-page SBE description, table of contents.', 'Each standard as a heading, each performance indicator as a subheading.'],
    ...s,
  });
  add(2, 'sbe-evidence-list', 'check', 'Start an evidence list: the photo, record, chart, or example that proves each indicator', s);
  add(2, 'sbe-numbers', 'check', "Pull this year's numbers: sales and POS reports, budget, revenue to date, inventory counts", s);
  // Week 3: evidence
  add(3, 'sbe-description', 'check', 'Write the one-page SBE description', { detail: ['Target market, revenue, product mix, location, and strategic goals for the year.'], ...s });
  add(3, 'sbe-photos', 'check', 'Take photos: the required SBE photo, displays, students at work, and equipment', s);
  add(3, 'sbe-survey', 'check', 'Survey or interview customers (evidence for Standards 3 and 4)', s);
  // Weeks 4-8: draft the standards
  SBE_STANDARDS.forEach(([week, n, name, indicators, extra]) => {
    add(week, `sbe-std-${n}`, 'check', `Draft Standard ${n}: ${name} (all ${indicators.length} indicators)`, {
      detail: [...indicators, ...(extra ? [extra] : []), SBE_EVIDENCE],
      ...s,
    });
  });
  add(5, 'sbe-checkin', 'link', 'Share Standards 1-4 with your advisor for a check-in', { linkLabel: 'Standards 1-4', ...s });
  add(8, 'sbe-draft', 'link', 'Share your full rough draft', { linkLabel: 'Full rough draft', ...s });
  // Week 9: self-score and advisor review
  add(9, 'sbe-self-score', 'check', "Rate every indicator with DECA's Novice-to-Exemplary scale; rewrite anything below Proficient", { link: 'guidelines', ...s });
  add(9, 'sbe-student-roles', 'check', 'Check every indicator for student decisions, real examples, and evidence (what the top rating looks for)', s);
  add(9, 'sbe-advisor-review', 'check', 'Your advisor reviews the full draft', s);
  // Weeks 10-11: winter break, lighter
  add(10, 'sbe-revise', 'check', "Work through your advisor's comments", s);
  add(10, 'sbe-strengthen', 'check', 'Add charts, records, or photos where the evidence is thin', s);
  add(11, 'sbe-format', 'check', 'Format check', {
    link: 'guidelines',
    detail: [
      'Title page: certification program, level (Gold), chapter, advisor and email, date, Food or Retail Operations.',
      'SBE description on page 2, then a table of contents listing every standard and its page.',
      'Body is 50 pages or less, size 12 font for the main content.',
      'Chapter name and state in the footer, with page numbers. Bibliography if you used outside sources.',
    ],
    ...s,
  });
  add(11, 'sbe-submit-instructions', 'check', "Read DECA's online submission instructions", { link: 'submitInstructions', ...s });
  // Week 12: finish and hand off
  add(12, 'sbe-proofread', 'check', 'Final proofread of the whole manual', s);
  add(12, 'sbe-final', 'link', 'Share the final manual as a PDF', { linkLabel: 'Final manual (PDF)', ...s });
  add(12, 'sbe-photo-jpg', 'check', 'Save the SBE photo as a JPG (or make sure it is in the manual)', s);
  add(12, 'sbe-assurances', 'check', 'Review the Statement of Assurances together', { link: 'guidelines', ...s });
  add(12, 'sbe-handoff', 'check', 'Hand off to your advisor to submit by 11:59 p.m. January 14', {
    link: 'submit',
    detail: ['The advisor submits at sbe.decaregistration.com; DECA emails a $25 invoice.'],
    ...s,
  });
}

// SBE individual certification: each student's own online exam.
// PLACEHOLDER tasks until the BowtieGOAT SBE timeline is written.
function sbeIndividualTasks(add) {
  add(1, 'sbi-guidelines', 'check', 'Read the individual certification guidelines', { link: 'guidelines' });
  add(1, 'sbi-instructions', 'check', 'Read the exam instructions and FAQ', { link: 'instructions' });
  [2, 3, 4, 5].forEach((week) => add(week, `sbi-study-${week}`, 'check', 'Study the SBE exam study guide', { link: 'studyGuide' }));
  add(6, 'sbi-exam', 'check', 'Take the SBE individual certification exam', { link: 'exam' });
}

// All tasks in the plan, before checking what's done. shared = the team
// shares it (one check-off counts for everyone).
export function planTasks({ eventCode, cluster, exams, type = planType(eventCode) }) {
  const tasks = [];
  const add = (week, id, kind, label, extra = {}) => tasks.push({ week, id, kind, label, shared: false, ...extra });
  if (type === 'sbeChapter') sbeChapterTasks(add);
  else if (type === 'sbeIndividual') sbeIndividualTasks(add);
  else if (type === 'written') writtenTasks({ eventCode, cluster, exams }, add);
  else if (type === 'selling') sellingTasks({ eventCode, cluster, exams }, add);
  else rolePlayTasks({ eventCode, cluster, exams }, add);
  // Suggested order within a week: exams, role plays, links, then the rest.
  // SBE plans keep the order they're written in (each week's steps build on each other).
  const ORDER = { exam: 0, retake: 1, roleplay: 2, judge: 3, areas: 4, link: 5, check: 6, cards: 7 };
  const byKind = !String(type).startsWith('sbe');
  return tasks.sort((a, b) => a.week - b.week || (byKind ? ORDER[a.kind] - ORDER[b.kind] : 0));
}

// Ids of the tasks a team shares in this event's plan.
export function sharedTaskIds(eventCode) {
  return new Set(planTasks({ eventCode, cluster: '', exams: [] }).filter((t) => t.shared).map((t) => t.id));
}

// Combines several students' (or a team's) shared progress: every check-off
// and every link anyone made. Used when an advisor pairs students.
export function mergeProgress(sources, sharedIds) {
  const planChecks = {};
  const planLinks = {};
  sources.forEach((src) => {
    // Keep the check-off's value (its date, or true for older ones).
    Object.keys(src?.planChecks || {}).forEach((id) => { if (sharedIds.has(id) && src.planChecks[id] && !planChecks[id]) planChecks[id] = src.planChecks[id]; });
    Object.entries(src?.planLinks || {}).forEach(([id, list]) => {
      if (!sharedIds.has(id)) return;
      const all = [...(planLinks[id] || []), ...(list || [])];
      const byUrl = new Map(all.map((l) => [`${l.url}|${l.at}`, l]));
      planLinks[id] = [...byUrl.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    });
  });
  return { planChecks, planLinks };
}

// The plan's week for a date (clamped to the plan's weeks).
export function weekOfDate(weeks, day) {
  const week = weeks.find((w) => day >= w.start && day <= w.end);
  if (week) return week.number;
  return day < weeks[0].start ? 1 : weeks.length;
}

// Advisor items (info only) for a student: group 'roleplay' or 'prepared'
// (plus 'everyone'). Items are placed by their date, or their week's Monday,
// since role play and prepared plans have different weeks.
export function advisorItems(items = [], weeks, { group }) {
  return items
    .filter((it) => it.group === 'everyone' || it.group === group)
    .map((it) => ({ ...it, week: it.date || it.weekStart ? weekOfDate(weeks, it.date || it.weekStart) : it.week }))
    .sort((a, b) => a.week - b.week || String(a.date || '').localeCompare(String(b.date || '')));
}

// Works out each task's status. attempts = the student's exam attempts
// (current track); logs = their role play logs for this event; checks and
// links = their progress (team progress already merged in by the caller).
// removed = task ids the school's advisors took off the plan; excused = task
// ids an advisor excused for this student. Both are hidden and not counted.
// cardDays = the student's PI card study days (cardProgress studyDays), or
// null when their event has no PI cards yet (the task shows "coming soon").
// cardsSince = the day their deck went live; card tasks from weeks that
// ended before then are dropped, since students couldn't have done them.
export function planStatus({
  eventCode, cluster, exams, competitionDate, attempts, logs = [], checks = {}, links = {}, removed = [], excused = {}, cardDays = null, cardsSince = null, today = ymd(new Date()),
}) {
  const type = planType(eventCode) || 'roleplay';
  const weeks = planWeeks(competitionDate, PLANS[type].weeks);
  const allTasks = planTasks({ eventCode, cluster, exams, type });
  const beforeCards = (t) => t.kind === 'cards' && cardsSince && weeks[t.week - 1].end < cardsSince;
  const tasks = allTasks.filter((t) => !removed.includes(t.id) && !excused[t.id] && !beforeCards(t));
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
      case 'cards': return !!cardDays && studyDaysBetween(cardDays, weeks[t.week - 1].start, weeks[t.week - 1].end) >= 3;
      case 'exam': return tries(t.examId) >= t.tryNumber;
      case 'roleplay': return counted.length >= t.count && timedCount >= t.timedNeeded;
      case 'judge': return counted.some((l) => ADULT_JUDGES.includes(l.judge));
      case 'areas': return areas.size >= 3;
      case 'retake': return retakesInPlan - pflRetakes >= 1;
      case 'link': return !!links[t.id]?.length;
      case 'check': return !!checks[t.id];
      default: return false;
    }
  };
  const result = tasks.map((t) => {
    const week = weeks[t.week - 1];
    const isDone = done(t);
    const comingSoon = t.kind === 'cards' && !cardDays;
    const state = isDone ? 'done' : comingSoon ? 'soon' : today > week.end ? 'overdue' : today >= week.start ? 'due' : 'upcoming';
    const note = t.kind === 'roleplay' ? `${Math.min(counted.length, t.count)} of ${t.count} logged${t.timedNeeded ? ` · ${Math.min(timedCount, t.timedNeeded)} of ${t.timedNeeded} timed` : ''}`
      : t.kind === 'areas' ? `${areas.size} of 3 so far`
        : t.kind === 'cards' && cardDays && !isDone && today >= week.start ? `${studyDaysBetween(cardDays, week.start, week.end)} of 3 days so far`
        : t.kind === 'retake' && weakest && !isDone ? `Weakest so far: ${weakest.examLabel} (${weakest.correct}/${weakest.total})`
          : '';
    return { ...t, weekStart: week.start, weekEnd: week.end, state, note };
  });
  const current = weeks.find((w) => today >= w.start && today <= w.end);
  const counting = result.filter((t) => t.state !== 'soon');
  const overdue = result.filter((t) => t.state === 'overdue');
  return {
    type,
    weeks,
    tasks: result,
    excusedTasks: allTasks.filter((t) => excused[t.id] && !removed.includes(t.id)),
    currentWeek: current?.number || (today < weeks[0].start ? 0 : weeks.length + 1),
    started: today >= weeks[0].start,
    doneCount: counting.filter((t) => t.state === 'done').length,
    totalCount: counting.length,
    overdue,
    stoplight: overdue.length === 0 ? 'green' : overdue.length <= 2 ? 'yellow' : 'red',
  };
}

// A plan as advisors see it for the whole chapter (exam names are generic
// because each cluster has its own exams). Written events show IMC's exams.
export function planTemplate(type = 'roleplay') {
  const exams = EXAM_YEARS.map((year) => ({ id: `template-${year}`, cluster: 'template', level: 'Districts', year, label: `20${year}`, subtitle: 'District cluster exam' }));
  const sample = { roleplay: 'STDM', written: 'IMCP', selling: 'PSE', sbeChapter: 'SBEC', sbeIndividual: 'SBEI' }[type];
  const examWeeks = PLANS[type].examWeeks;
  return planTasks({ eventCode: sample, cluster: 'template', exams, type })
    .map((t) => (t.kind === 'exam'
      ? { ...t, label: `Take the 20${EXAM_YEARS[examWeeks.indexOf(t.week)]} District cluster exam${type === 'written' ? ' (Integrated Marketing Campaign only)' : ''}` }
      : t.kind === 'retake' && type === 'written' ? { ...t, label: `${t.label} (Integrated Marketing Campaign only)` }
        : t.id === 'w-split' ? { ...t, label: `${t.label} (teams only)` }
          : t.id.startsWith('w-review') ? { ...t, label: `${t.label} (Integrated Marketing Campaign only)` } : t));
}
