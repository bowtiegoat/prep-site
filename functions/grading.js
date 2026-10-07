// Pure grading and stats helpers (no Firebase calls) so they can be unit tested.

const CHOICES = ['A', 'B', 'C', 'D'];

// key: [{ q, answer, code, indicator, source }] sorted by q.
// answers: array the same length as key; each 'A'-'D' or null for blank.
function grade(key, answers) {
  const clean = key.map((_, i) => (CHOICES.includes(answers[i]) ? answers[i] : null));
  let correct = 0;
  const missed = [];
  key.forEach((k, i) => {
    if (clean[i] === k.answer) {
      correct += 1;
    } else {
      missed.push({
        q: k.q,
        yourAnswer: clean[i],
        correctAnswer: k.answer,
        code: k.code || '',
        indicator: k.indicator || '',
        source: k.source || '',
      });
    }
  });
  return { answers: clean, correct, total: key.length, missed };
}

// Mid-rank percentile: share of test-takers scoring below, plus half of ties.
// histogram[n] = number of first attempts that got n questions correct.
function percentile(histogram, correct, takers) {
  if (!takers) return null;
  let below = 0;
  for (let n = 0; n < correct; n += 1) below += histogram[n] || 0;
  const equal = histogram[correct] || 0;
  return Math.round(((below + equal / 2) / takers) * 100);
}

function summarize(stats, correct) {
  const takers = stats.takers || 0;
  return {
    takers,
    averageCorrect: takers ? Math.round((stats.sumCorrect / takers) * 10) / 10 : null,
    percentile: percentile(stats.histogram || [], correct, takers),
  };
}

// Adds one first attempt to an exam's stats (returns a new object).
function addToStats(stats, correct, total) {
  const histogram = (stats && stats.histogram ? [...stats.histogram] : []);
  while (histogram.length < total + 1) histogram.push(0);
  histogram[correct] += 1;
  return {
    ...stats,
    total,
    takers: ((stats && stats.takers) || 0) + 1,
    sumCorrect: ((stats && stats.sumCorrect) || 0) + correct,
    histogram,
  };
}

// Removes one first attempt from an exam's stats (returns a new object).
function removeFromStats(stats, correct) {
  const histogram = [...(stats.histogram || [])];
  if (histogram[correct] > 0) histogram[correct] -= 1;
  return {
    ...stats,
    total: stats.total,
    takers: Math.max(0, (stats.takers || 0) - 1),
    sumCorrect: Math.max(0, (stats.sumCorrect || 0) - correct),
    histogram,
  };
}

// Summarizes a list of imported scores (number correct each) as a batch.
function batchFromScores(scores, total) {
  const histogram = Array(total + 1).fill(0);
  scores.forEach((n) => { histogram[n] += 1; });
  return { count: scores.length, sumCorrect: scores.reduce((a, b) => a + b, 0), histogram };
}

// Per-question results: questionCorrect[i] = how many counted test-takers got
// question i+1 right, out of questionTakers. Only first attempts (and imports
// that include per-question data) count, same as the score stats.

// Right/wrong flags (1/0) for each question, from a saved attempt's misses.
function correctFlags(total, missed) {
  const wrong = new Set((missed || []).map((m) => m.q));
  return Array.from({ length: total }, (_, i) => (wrong.has(i + 1) ? 0 : 1));
}

// Adds (sign 1) or removes (sign -1) per-question counts from an exam's stats.
// counts[i] = number right on question i+1; takers = how many people that covers.
function applyQuestionCounts(stats, counts, takers, sign) {
  if (!Array.isArray(counts) || !counts.length) return stats;
  const questionCorrect = [...((stats && stats.questionCorrect) || [])];
  while (questionCorrect.length < counts.length) questionCorrect.push(0);
  counts.forEach((n, i) => { questionCorrect[i] = Math.max(0, questionCorrect[i] + sign * n); });
  return {
    ...stats,
    questionCorrect,
    questionTakers: Math.max(0, ((stats && stats.questionTakers) || 0) + sign * takers),
  };
}

// Adds (sign 1) or removes (sign -1) an imported batch from an exam's stats.
function applyBatch(stats, batch, sign) {
  const histogram = [...((stats && stats.histogram) || [])];
  while (histogram.length < batch.histogram.length) histogram.push(0);
  batch.histogram.forEach((n, i) => { histogram[i] = Math.max(0, histogram[i] + sign * n); });
  const clamp = (n) => Math.max(0, n);
  const next = {
    ...stats,
    total: (stats && stats.total) || batch.histogram.length - 1,
    takers: clamp(((stats && stats.takers) || 0) + sign * batch.count),
    sumCorrect: clamp(((stats && stats.sumCorrect) || 0) + sign * batch.sumCorrect),
    importedTakers: clamp(((stats && stats.importedTakers) || 0) + sign * batch.count),
    histogram,
  };
  return batch.perQuestionCorrect ? applyQuestionCounts(next, batch.perQuestionCorrect, batch.count, sign) : next;
}

module.exports = {
  CHOICES, grade, percentile, summarize, addToStats, removeFromStats, batchFromScores, applyBatch,
  correctFlags, applyQuestionCounts,
};
