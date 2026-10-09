// Server code for prep.thebowtiegoat.com. Students can't write to the database
// directly; everything they save goes through these functions.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const EVENTS = require('./events');
const {
  grade, summarize, addToStats, removeFromStats, batchFromScores, applyBatch, correctFlags, applyQuestionCounts,
} = require('./grading');

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Callable functions must be reachable by anyone; each one checks sign-in itself.
const CALLABLE = { invoker: 'public' };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
// Students can retake an exam this many days after their last try (keep in
// sync with docs/js/attempts.js). Taking one exam more than FLAG_ATTEMPTS
// times adds a flag for the admin to review.
const RETAKE_DAYS = 3;
const FLAG_ATTEMPTS = 5;
const ADMIN_EMAIL = 'justin@thebowtiegoat.com';

function requireUser(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return req.auth;
}

function requireAdmin(req) {
  const auth = requireUser(req);
  if (auth.token.email !== ADMIN_EMAIL || auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Only the admin can do that.');
  }
  return auth;
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

// Changing events keeps the student's results. (Students used to be able to
// start over on a new "track"; now they retake exams instead. Old started-over
// attempts stay in the database for the admin.)
exports.changeEvent = onCall(CALLABLE, async (req) => {
  const auth = requireUser(req);
  const { eventCode } = req.data || {};
  const event = EVENTS.find((e) => e.code === eventCode);
  if (!event) throw invalid('Please pick your event.');
  const userRef = db.doc(`users/${auth.uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'Finish signing up first.');
    const user = snap.data();
    if (user.eventCode === event.code) throw invalid("That's already your event.");
    const track = user.track || 1;
    tx.update(userRef, {
      eventCode: event.code,
      eventName: event.event,
      cluster: event.cluster,
      track,
      eventHistory: FieldValue.arrayUnion({ eventCode: event.code, track, keptResults: true, at: new Date() }),
    });
    return { ok: true, track };
  });
});

// Grades a submitted exam, saves the attempt, and updates the site-wide stats.
// Students may retake an exam RETAKE_DAYS after their last try; every attempt
// counts toward the stats. Attempt 1 keeps the original id (uid_track_examId);
// later attempts add _2, _3, ...
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
  if (EVENTS.NO_EXAM_EVENTS.has(user.eventCode)) throw new HttpsError('permission-denied', "Your event doesn't take a cluster exam.");
  const key = keySnap.data().questions;
  if (answers.length !== key.length) throw invalid(`Expected ${key.length} answers.`);

  const graded = grade(key, answers);
  const started = Number.isFinite(startedAt) && startedAt > 0 && startedAt <= Date.now() ? new Date(startedAt) : null;
  const track = user.track || 1;
  const baseId = `${auth.uid}_${track}_${examId}`;
  const statsRef = db.doc(`examStats/${examId}`);
  const earlierQuery = db.collection('attempts')
    .where('uid', '==', auth.uid).where('examId', '==', examId).where('track', '==', track);

  const attemptId = await db.runTransaction(async (tx) => {
    const [earlierSnap, statsSnap] = await Promise.all([tx.get(earlierQuery), tx.get(statsRef)]);
    const earlier = earlierSnap.docs.map((d) => d.data());
    const last = Math.max(0, ...earlier.map((a) => (a.submittedAt ? a.submittedAt.toMillis() : 0)));
    const retakeAt = last + RETAKE_DAYS * 86400000;
    if (earlier.length && Date.now() < retakeAt) {
      const when = new Date(retakeAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
      throw new HttpsError('failed-precondition', `You can retake this exam on ${when}.`);
    }
    const number = Math.max(0, ...earlier.map((a) => a.attemptNumber || 1)) + 1;
    const id = number === 1 ? baseId : `${baseId}_${number}`;
    const attemptRef = db.doc(`attempts/${id}`);

    let stats = statsSnap.exists ? statsSnap.data() : { takers: 0, sumCorrect: 0, histogram: [] };
    stats = addToStats(stats, graded.correct, graded.total);
    stats = applyQuestionCounts(stats, correctFlags(graded.total, graded.missed), 1, 1);
    tx.set(statsRef, { ...stats, updatedAt: FieldValue.serverTimestamp() });
    tx.set(attemptRef, {
      uid: auth.uid,
      track,
      examId,
      attemptNumber: number,
      examLabel: exam.label,
      examSubtitle: exam.subtitle || '',
      cluster: exam.cluster,
      eventCode: user.eventCode,
      schoolId: user.schoolId,
      answers: graded.answers,
      correct: graded.correct,
      total: graded.total,
      missed: graded.missed,
      countsForStats: true,
      statsAtSubmit: summarize(stats, graded.correct),
      startedAt: started,
      submittedAt: FieldValue.serverTimestamp(),
    });

    // Site flag: the same exam taken more than FLAG_ATTEMPTS times. A new try reopens a reviewed flag.
    if (number > FLAG_ATTEMPTS) {
      const flagRef = db.doc(`flags/attempts_${auth.uid}_${examId}`);
      tx.set(flagRef, {
        type: 'many-attempts',
        uid: auth.uid,
        studentName: `${user.firstName} ${user.lastName}`,
        email: user.email || '',
        schoolId: user.schoolId,
        schoolName: user.schoolName || '',
        examId,
        examLabel: `${exam.cluster} · ${exam.label}${exam.subtitle ? ` · ${exam.subtitle}` : ''}`,
        attempts: number,
        status: 'open',
        updatedAt: FieldValue.serverTimestamp(),
        ...(number === FLAG_ATTEMPTS + 1 ? { createdAt: FieldValue.serverTimestamp() } : {}),
      }, { merge: true });
    }
    return id;
  });
  return { attemptId };
});

// Admin, or an advisor at the student's school, can delete an attempt. The
// student can then take that exam again. A copy is kept in deletedAttempts.
exports.deleteAttempt = onCall(CALLABLE, async (req) => {
  const auth = requireUser(req);
  const { attemptId } = req.data || {};
  if (typeof attemptId !== 'string' || !ID_PATTERN.test(attemptId)) throw invalid('Unknown attempt.');
  const email = (auth.token.email || '').toLowerCase();
  const verified = auth.token.email_verified === true;
  const attemptRef = db.doc(`attempts/${attemptId}`);

  const first = await attemptRef.get();
  if (!first.exists) throw new HttpsError('not-found', 'That attempt was already deleted.');
  let role = null;
  if (verified && email === ADMIN_EMAIL) {
    role = 'admin';
  } else if (verified && email) {
    const advisor = await db.collection('advisors')
      .where('email', '==', email)
      .where('schoolId', '==', first.data().schoolId)
      .limit(1)
      .get();
    if (!advisor.empty) role = 'advisor';
  }
  if (!role) throw new HttpsError('permission-denied', "You can only delete attempts from your own school's students.");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(attemptRef);
    if (!snap.exists) return;
    const attempt = snap.data();
    const statsRef = db.doc(`examStats/${attempt.examId}`);
    // Attempts from before retakes were tracked in statsEntries (one per student per exam).
    const entryRef = db.doc(`statsEntries/${attempt.examId}_${attempt.uid}`);
    const [statsSnap, entrySnap] = await Promise.all([tx.get(statsRef), tx.get(entryRef)]);
    const entryMatches = entrySnap.exists && entrySnap.data().attemptId === attemptId;

    if (statsSnap.exists && (attempt.countsForStats || entryMatches)) {
      let stats = removeFromStats(statsSnap.data(), attempt.correct);
      // Skip if per-question counts haven't been built yet (Admin → Rebuild insights data).
      if ((statsSnap.data().questionTakers || 0) > 0) {
        stats = applyQuestionCounts(stats, correctFlags(attempt.total, attempt.missed), 1, -1);
      }
      tx.set(statsRef, { ...stats, updatedAt: FieldValue.serverTimestamp() });
    }
    if (entryMatches) tx.delete(entryRef);
    tx.set(db.doc(`deletedAttempts/${attemptId}`), {
      ...attempt,
      deletedBy: email,
      deletedByRole: role,
      deletedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(attemptRef);
  });
  return { ok: true };
});

// Admin: add anonymous past scores (e.g. a ZipGrade export) to an exam's
// site-wide stats as a named batch that can be deleted later.
exports.adminImportScores = onCall(CALLABLE, async (req) => {
  const auth = requireAdmin(req);
  const { examId, name, source, fileName, scores, perQuestionCorrect } = req.data || {};
  if (typeof examId !== 'string' || !ID_PATTERN.test(examId)) throw invalid('Pick an exam.');
  const batchName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!batchName) throw invalid('Give the batch a name.');
  const examSnap = await db.doc(`exams/${examId}`).get();
  if (!examSnap.exists) throw new HttpsError('not-found', "That exam isn't on the site.");
  const exam = examSnap.data();
  const total = exam.questionCount;
  if (!Array.isArray(scores) || !scores.length || scores.length > 5000
      || !scores.every((n) => Number.isInteger(n) && n >= 0 && n <= total)) {
    throw invalid(`Scores must be whole numbers from 0 to ${total}.`);
  }
  const perQuestion = Array.isArray(perQuestionCorrect) && perQuestionCorrect.length === total
      && perQuestionCorrect.every((n) => Number.isInteger(n) && n >= 0 && n <= scores.length)
    ? perQuestionCorrect
    : null;

  const batch = { ...batchFromScores(scores, total), perQuestionCorrect: perQuestion };
  const batchRef = db.collection('statsImports').doc();
  const statsRef = db.doc(`examStats/${examId}`);
  await db.runTransaction(async (tx) => {
    const statsSnap = await tx.get(statsRef);
    const stats = applyBatch(statsSnap.exists ? statsSnap.data() : null, batch, 1);
    tx.set(statsRef, { ...stats, updatedAt: FieldValue.serverTimestamp() });
    tx.set(batchRef, {
      name: batchName,
      source: typeof source === 'string' ? source.slice(0, 40) : '',
      fileName: typeof fileName === 'string' ? fileName.slice(0, 200) : '',
      examId,
      examLabel: exam.label,
      examSubtitle: exam.subtitle || '',
      cluster: exam.cluster,
      ...batch,
      importedBy: auth.token.email,
      importedAt: FieldValue.serverTimestamp(),
    });
  });
  return { batchId: batchRef.id, count: batch.count };
});

// Admin: remove an imported batch's scores from the stats.
exports.adminDeleteImport = onCall(CALLABLE, async (req) => {
  requireAdmin(req);
  const { batchId } = req.data || {};
  if (typeof batchId !== 'string' || !ID_PATTERN.test(batchId)) throw invalid('Unknown batch.');
  const batchRef = db.doc(`statsImports/${batchId}`);
  await db.runTransaction(async (tx) => {
    const batchSnap = await tx.get(batchRef);
    if (!batchSnap.exists) throw new HttpsError('not-found', 'That batch was already deleted.');
    const batch = batchSnap.data();
    const statsRef = db.doc(`examStats/${batch.examId}`);
    const statsSnap = await tx.get(statsRef);
    if (statsSnap.exists) {
      tx.set(statsRef, { ...applyBatch(statsSnap.data(), batch, -1), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.delete(batchRef);
  });
  return { ok: true };
});

// Admin: (re)build the data behind the exam deep-dive page.
// - examQuestions/{examId}: each question's PI and source, WITHOUT answers, so
//   students can see what every question covered (not just the ones they missed),
//   plus how many answers are A/B/C/D.
// - examStats questionCorrect/questionTakers: per-question counts, recounted
//   from scratch from first attempts and imported batches that include them.
// Safe to run again any time (e.g. after re-uploading an exam's answer key).
exports.adminRebuildInsights = onCall({ ...CALLABLE, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  requireAdmin(req);
  const [examSnap, keySnap, attemptSnap, importSnap] = await Promise.all([
    db.collection('exams').get(),
    db.collection('examKeys').get(),
    db.collection('attempts').where('countsForStats', '==', true).get(),
    db.collection('statsImports').get(),
  ]);
  const keys = new Map(keySnap.docs.map((d) => [d.id, d.data().questions || []]));
  let exams = 0;
  for (const examDoc of examSnap.docs) {
    const key = keys.get(examDoc.id);
    if (!key || !key.length) continue;
    const exam = examDoc.data();
    const answerCounts = { A: 0, B: 0, C: 0, D: 0 };
    key.forEach((k) => { if (k.answer in answerCounts) answerCounts[k.answer] += 1; });

    let counts = { questionCorrect: Array(key.length).fill(0), questionTakers: 0 };
    attemptSnap.docs.map((d) => d.data()).filter((a) => a.examId === examDoc.id).forEach((a) => {
      const flags = key.map((k, i) => (a.answers && a.answers[i] === k.answer ? 1 : 0));
      counts = applyQuestionCounts(counts, flags, 1, 1);
    });
    importSnap.docs.map((d) => d.data())
      .filter((b) => b.examId === examDoc.id && Array.isArray(b.perQuestionCorrect) && b.perQuestionCorrect.length === key.length)
      .forEach((b) => { counts = applyQuestionCounts(counts, b.perQuestionCorrect, b.count, 1); });

    const batch = db.batch();
    batch.set(db.doc(`examQuestions/${examDoc.id}`), {
      cluster: exam.cluster,
      level: exam.level,
      year: exam.year,
      label: exam.label,
      subtitle: exam.subtitle || '',
      questions: key.map(({ q, code, indicator, source }) => ({ q, code: code || '', indicator: indicator || '', source: source || '' })),
      answerCounts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`examStats/${examDoc.id}`), {
      questionCorrect: counts.questionCorrect,
      questionTakers: counts.questionTakers,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    exams += 1;
  }
  return { exams };
});
