// Exam retakes: a student can take an exam again 3 days after their last
// try. These helpers group a student's attempts by exam. Keep RETAKE_DAYS
// in sync with functions/index.js.

export const RETAKE_DAYS = 3;
const DAY = 86400000;

const millis = (a) => a.submittedAt?.toMillis?.() || 0;

// Attempt 1, 2, 3… (attempts from before retakes existed are attempt 1).
export const attemptNumber = (a) => a.attemptNumber || 1;

// Map examId -> that exam's attempts, oldest first.
export function byExam(attempts) {
  const groups = new Map();
  [...attempts].sort((a, b) => millis(a) - millis(b)).forEach((a) => {
    if (!groups.has(a.examId)) groups.set(a.examId, []);
    groups.get(a.examId).push(a);
  });
  return groups;
}

// Each exam's first attempt only (what the student knew at first).
export function firstAttempts(attempts) {
  return [...byExam(attempts).values()].map((list) => list[0]);
}

// Each exam's most recent attempt, newest first.
export function latestAttempts(attempts) {
  return [...byExam(attempts).values()].map((list) => list[list.length - 1]).sort((a, b) => millis(b) - millis(a));
}

// When the student may retake an exam (a Date), or null if they can now.
export function retakeAvailableAt(list) {
  const last = list?.length ? millis(list[list.length - 1]) : 0;
  if (!last) return null;
  const at = new Date(last + RETAKE_DAYS * DAY);
  return at > new Date() ? at : null;
}

export function shortDay(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
