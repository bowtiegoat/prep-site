// PREVIEW ONLY: the server functions students use, run in the browser.
import { ready, save, table, keys, timestamp, DEMO_USER } from './store.js';
import { grade, summarize, addToStats } from './grading.js';
import { EVENTS } from '/js/events.js';

// Same as the real server: SBE Chapter Certification students share one team per school.
function updateSbeTeam(user, joining) {
  const id = `sbe-${user.schoolId}`;
  const team = table('teams')[id];
  if (!joining) {
    if (team) team.memberUids = team.memberUids.filter((u) => u !== DEMO_USER.uid);
    return;
  }
  const pick = (map = {}) => Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith('sbe-')));
  if (team) {
    team.memberUids = [...new Set([...team.memberUids, DEMO_USER.uid])];
    team.planChecks = { ...pick(user.planChecks), ...(team.planChecks || {}) };
    team.planLinks = { ...pick(user.planLinks), ...(team.planLinks || {}) };
  } else {
    table('teams')[id] = {
      schoolId: user.schoolId, eventCode: 'SBEC', memberUids: [DEMO_USER.uid],
      planChecks: pick(user.planChecks), planLinks: pick(user.planLinks), createdBy: 'automatic (SBE chapter team)', createdAt: timestamp(new Date()),
    };
  }
}

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
    if (event.code === 'SBEC') updateSbeTeam(table('users')[DEMO_USER.uid], true);
    save();
    return { ok: true };
  },

  async changeEvent({ eventCode }) {
    const user = table('users')[DEMO_USER.uid];
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    if (user.eventCode === event.code) fail("That's already your event.");
    if (user.eventCode === 'SBEC' || event.code === 'SBEC') updateSbeTeam(user, event.code === 'SBEC');
    Object.assign(user, { eventCode: event.code, eventName: event.event, cluster: event.cluster });
    user.eventHistory = [...(user.eventHistory || []), { eventCode: event.code, track: user.track, keptResults: true, at: timestamp(new Date()) }];
    save();
    return { ok: true, track: user.track };
  },

  // More than one event (same rules as the real server).
  async addEvent({ eventCode }) {
    const user = table('users')[DEMO_USER.uid];
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    const settings = table('schools')[user.schoolId]?.eventSettings || {};
    if (!settings.multi) fail("Your advisor hasn't turned on more than one event.");
    const max = settings.max === 3 ? 3 : 2;
    const extras = user.extraEvents || [];
    if (user.eventCode === event.code || extras.includes(event.code)) fail("That's already one of your events.");
    if (1 + extras.length >= max) fail(`Your school allows ${max} events per student.`);
    user.extraEvents = [...extras, event.code];
    user.eventHistory = [...(user.eventHistory || []), { eventCode: event.code, added: true, at: timestamp(new Date()) }];
    if (event.code === 'SBEC') updateSbeTeam(user, true);
    save();
    return { ok: true };
  },

  async removeEvent({ eventCode }) {
    const user = table('users')[DEMO_USER.uid];
    if (user.eventCode === eventCode) fail("That's your main event. Make another event your main one first.");
    if (!(user.extraEvents || []).includes(eventCode)) fail("That isn't one of your events.");
    user.extraEvents = user.extraEvents.filter((c) => c !== eventCode);
    ['planChecks', 'planLinks', 'planExcused'].forEach((f) => {
      Object.keys(user[f] || {}).filter((k) => k.startsWith(`${eventCode}__`)).forEach((k) => delete user[f][k]);
    });
    if (eventCode === 'SBEC') updateSbeTeam(user, false);
    save();
    return { ok: true };
  },

  async setMainEvent({ eventCode }) {
    const user = table('users')[DEMO_USER.uid];
    const event = EVENTS.find((e) => e.code === eventCode) || fail('Please pick your event.');
    if (!(user.extraEvents || []).includes(event.code)) fail("That isn't one of your events.");
    const oldMain = user.eventCode;
    const swap = (map = {}) => Object.fromEntries(Object.entries(map).map(([k, v]) => (k.startsWith(`${event.code}__`) ? [k.slice(event.code.length + 2), v]
      : /^[A-Z]+__/.test(k) ? [k, v] : [`${oldMain}__${k}`, v])));
    const late = { ...(user.planLateHandledEvents || {}) };
    const newLate = !!late[event.code];
    delete late[event.code];
    if (user.planLateHandled) late[oldMain] = true;
    Object.assign(user, {
      eventCode: event.code, eventName: event.event, cluster: event.cluster,
      extraEvents: [oldMain, ...user.extraEvents.filter((c) => c !== event.code)],
      planChecks: swap(user.planChecks), planLinks: swap(user.planLinks), planExcused: swap(user.planExcused),
      planLateHandled: newLate, planLateHandledEvents: late,
    });
    save();
    return { ok: true };
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
