// Server code for prep.thebowtiegoat.com. Students can't write to the database
// directly; everything they save goes through these functions.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const EVENTS = require('./events');
const { grade, summarize, addToStats } = require('./grading');

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Callable functions must be reachable by anyone; each one checks sign-in itself.
const CALLABLE = { invoker: 'public' };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function requireUser(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return req.auth;
}

function invalid(message) {
  return new HttpsError('invalid-argument', message);
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

// First visit: student enters name, school, school code, and event.
exports.joinSchool = onCall(CALLABLE, async (req) => {
  const auth = requireUser(req);
  const { firstName, lastName, schoolId, code, eventCode } = req.data || {};
  const first = cleanName(firstName);
  const last = cleanName(lastName);
  if (!first || !last) throw invalid('Please enter your first and last name.');
  if (typeof schoolId !== 'string' || !ID_PATTERN.test(schoolId)) throw invalid('Please pick your school.');
  const event = EVENTS.find((e) => e.code === eventCode);
  if (!event) throw invalid('Please pick your event.');

  const userRef = db.doc(`users/${auth.uid}`);
  const [userSnap, schoolSnap, codeSnap] = await Promise.all([
    userRef.get(),
    db.doc(`schools/${schoolId}`).get(),
    db.doc(`schoolCodes/${schoolId}`).get(),
  ]);
  if (userSnap.exists) throw new HttpsError('already-exists', "You've already joined a school.");
  if (!schoolSnap.exists || schoolSnap.data().active === false) throw invalid("That school isn't available.");
  if (!codeSnap.exists || normalizeCode(code) !== codeSnap.data().code) {
    throw new HttpsError('permission-denied', "That code doesn't match your school. Check with your advisor.");
  }

  await userRef.set({
    role: 'student',
    firstName: first,
    lastName: last,
    email: auth.token.email || '',
    schoolId,
    schoolName: schoolSnap.data().name,
    eventCode: event.code,
    eventName: event.event,
    cluster: event.cluster,
    track: 1,
    eventHistory: [{ eventCode: event.code, track: 1, at: new Date() }],
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// Changing events starts the student over (a new "track"). Old attempts stay
// in the database for the admin.
exports.changeEvent = onCall(CALLABLE, async (req) => {
  const auth = requireUser(req);
  const event = EVENTS.find((e) => e.code === (req.data || {}).eventCode);
  if (!event) throw invalid('Please pick your event.');
  const userRef = db.doc(`users/${auth.uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'Finish signing up first.');
    const user = snap.data();
    if (user.eventCode === event.code) throw invalid("That's already your event.");
    const track = (user.track || 1) + 1;
    tx.update(userRef, {
      eventCode: event.code,
      eventName: event.event,
      cluster: event.cluster,
      track,
      eventHistory: FieldValue.arrayUnion({ eventCode: event.code, track, at: new Date() }),
    });
    return { ok: true, track };
  });
});

// Grades a submitted exam, saves the attempt, and updates the site-wide stats.
// Only a student's first attempt at an exam counts toward the stats.
exports.submitAttempt = onCall(CALLABLE, async (req) => {
  const auth = requireUser(req);
  const { examId, answers, startedAt } = req.data || {};
  if (typeof examId !== 'string' || !ID_PATTERN.test(examId)) throw invalid('Unknown exam.');
  if (!Array.isArray(answers)) throw invalid('Missing answers.');

  const [userSnap, examSnap, keySnap] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.doc(`exams/${examId}`).get(),
    db.doc(`examKeys/${examId}`).get(),
  ]);
  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'Finish signing up first.');
  if (!examSnap.exists || !keySnap.exists) throw new HttpsError('not-found', 'That exam is no longer available.');
  const user = userSnap.data();
  const exam = examSnap.data();
  if (exam.cluster !== user.cluster) throw new HttpsError('permission-denied', "That exam isn't part of your event's cluster.");
  const key = keySnap.data().questions;
  if (answers.length !== key.length) throw invalid(`Expected ${key.length} answers.`);

  const graded = grade(key, answers);
  const started = Number.isFinite(startedAt) && startedAt > 0 && startedAt <= Date.now() ? new Date(startedAt) : null;
  const attemptId = `${auth.uid}_${user.track || 1}_${examId}`;
  const attemptRef = db.doc(`attempts/${attemptId}`);
  const statsRef = db.doc(`examStats/${examId}`);
  const entryRef = db.doc(`statsEntries/${examId}_${auth.uid}`);

  await db.runTransaction(async (tx) => {
    const [attemptSnap, statsSnap, entrySnap] = await Promise.all([tx.get(attemptRef), tx.get(statsRef), tx.get(entryRef)]);
    if (attemptSnap.exists) throw new HttpsError('already-exists', "You've already submitted this exam.");
    const countsForStats = !entrySnap.exists;
    let stats = statsSnap.exists ? statsSnap.data() : { takers: 0, sumCorrect: 0, histogram: [] };
    if (countsForStats) {
      stats = addToStats(stats, graded.correct, graded.total);
      tx.set(statsRef, { ...stats, updatedAt: FieldValue.serverTimestamp() });
      tx.set(entryRef, { attemptId, createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(attemptRef, {
      uid: auth.uid,
      track: user.track || 1,
      examId,
      examLabel: exam.label,
      examSubtitle: exam.subtitle || '',
      cluster: exam.cluster,
      eventCode: user.eventCode,
      schoolId: user.schoolId,
      answers: graded.answers,
      correct: graded.correct,
      total: graded.total,
      missed: graded.missed,
      countsForStats,
      statsAtSubmit: summarize(stats, graded.correct),
      startedAt: started,
      submittedAt: FieldValue.serverTimestamp(),
    });
  });
  return { attemptId };
});
