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

  async changeEvent({ eventCode }) {
    const user = table('users')[DEMO_USER.uid];
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    if (user.eventCode === event.code) fail("That's already your event.");
    Object.assign(user, { eventCode: event.code, eventName: event.event, cluster: event.cluster });
    user.eventHistory = [...(user.eventHistory || []), { eventCode: event.code, track: user.track, keptResults: true, at: timestamp(new Date()) }];
    save();
    return { ok: true, track: user.track };
  },

  // Same rules as the real server: a retake 3 days after the last try, every try counts, flag after 5.
  async submitAttempt({ examId, answers, startedAt }) {
    const user = table('users')[DEMO_USER.uid];
    const exam = table('exams')[examId];
    const key = (await keys())[examId];
    const earlier = Object.values(table('attempts')).filter((a) => a.uid === DEMO_USER.uid && a.examId === examId && a.track === user.track);
    const last = Math.max(0, ...earlier.map((a) => a.submittedAt.toMillis()));
    if (earlier.length && Date.now() < last + 3 * 86400000) fail(`You can retake this exam on ${new Date(last + 3 * 86400000).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`);
    const number = Math.max(0, ...earlier.map((a) => a.attemptNumber || 1)) + 1;
    const attemptId = `${DEMO_USER.uid}_${user.track}_${examId}${number > 1 ? `_${number}` : ''}`;
    const graded = grade(key, answers);
    const stats = table('examStats')[examId] = addToStats(table('examStats')[examId] || { takers: 0, sumCorrect: 0, histogram: [] }, graded.correct, graded.total);
    table('attempts')[attemptId] = {
      uid: DEMO_USER.uid, track: user.track, examId, attemptNumber: number, examLabel: exam.label, examSubtitle: exam.subtitle,
      cluster: exam.cluster, eventCode: user.eventCode, schoolId: user.schoolId,
      answers: graded.answers, correct: graded.correct, total: graded.total, missed: graded.missed,
      countsForStats: true, statsAtSubmit: summarize(stats, graded.correct),
      startedAt: startedAt ? timestamp(startedAt) : null, submittedAt: timestamp(new Date()),
    };
    if (number > 5) {
      table('flags')[`attempts_${DEMO_USER.uid}_${examId}`] = {
        type: 'many-attempts', uid: DEMO_USER.uid, studentName: `${user.firstName} ${user.lastName}`, email: user.email,
        schoolId: user.schoolId, schoolName: user.schoolName, examId, examLabel: `${exam.cluster} · ${exam.label} · ${exam.subtitle}`,
        attempts: number, status: 'open', updatedAt: timestamp(new Date()),
      };
    }
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
