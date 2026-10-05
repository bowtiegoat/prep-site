// PREVIEW ONLY: the server functions students use, run in the browser.
import { ready, save, table, keys, timestamp, DEMO_USER } from './store.js';
import { grade, summarize, addToStats } from './grading.js';
import { EVENTS } from '/js/events.js';

const fail = (message) => { throw Object.assign(new Error(message), { code: 'functions/failed-precondition' }); };

const handlers = {
  async joinSchool({ firstName, lastName, schoolId, code, eventCode }) {
    if (!firstName?.trim() || !lastName?.trim()) fail('Please enter your first and last name.');
    if (!table('schools')[schoolId]) fail('Please pick your school.');
    if (String(code).trim().toUpperCase() !== 'DEMO') fail("That code doesn't match your school. Check with your advisor. (Preview code: DEMO)");
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    table('users')[DEMO_USER.uid] = {
      role: 'student', firstName: firstName.trim(), lastName: lastName.trim(), email: DEMO_USER.email,
      schoolId, schoolName: table('schools')[schoolId].name,
      eventCode: event.code, eventName: event.event, cluster: event.cluster, track: 1,
      eventHistory: [{ eventCode: event.code, track: 1, at: timestamp(new Date()) }],
    };
    save();
    return { ok: true };
  },

  async changeEvent({ eventCode, keepResults }) {
    const user = table('users')[DEMO_USER.uid];
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    if (user.eventCode === event.code) fail("That's already your event.");
    const keep = keepResults !== false;
    user.track = keep ? user.track : user.track + 1;
    Object.assign(user, { eventCode: event.code, eventName: event.event, cluster: event.cluster });
    user.eventHistory = [...(user.eventHistory || []), { eventCode: event.code, track: user.track, keptResults: keep, at: timestamp(new Date()) }];
    save();
    return { ok: true, track: user.track };
  },

  async submitAttempt({ examId, answers, startedAt }) {
    const user = table('users')[DEMO_USER.uid];
    const exam = table('exams')[examId];
    const key = (await keys())[examId];
    const attemptId = `${DEMO_USER.uid}_${user.track}_${examId}`;
    if (table('attempts')[attemptId]) fail("You've already submitted this exam.");
    const graded = grade(key, answers);
    const counts = !Object.values(table('attempts')).some((a) => a.examId === examId && a.countsForStats);
    let stats = table('examStats')[examId] || { takers: 0, sumCorrect: 0, histogram: [] };
    if (counts) stats = table('examStats')[examId] = addToStats(stats, graded.correct, graded.total);
    table('attempts')[attemptId] = {
      uid: DEMO_USER.uid, track: user.track, examId, examLabel: exam.label, examSubtitle: exam.subtitle,
      cluster: exam.cluster, eventCode: user.eventCode, schoolId: user.schoolId,
      answers: graded.answers, correct: graded.correct, total: graded.total, missed: graded.missed,
      countsForStats: counts, statsAtSubmit: summarize(stats, graded.correct),
      startedAt: startedAt ? timestamp(startedAt) : null, submittedAt: timestamp(new Date()),
    };
    save();
    return { attemptId };
  },
};

handlers.deleteAttempt = async ({ attemptId }) => {
  delete table('attempts')[attemptId];
  save();
  return { ok: true };
};

export const getFunctions = () => ({});

export function httpsCallable(_functions, name) {
  return async (data) => {
    await ready();
    if (!handlers[name]) fail('Not available in the preview.');
    await new Promise((r) => setTimeout(r, 400)); // feel like a real server
    return { data: await handlers[name](data || {}) };
  };
}
