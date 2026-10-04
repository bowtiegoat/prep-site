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
    total,
    takers: ((stats && stats.takers) || 0) + 1,
    sumCorrect: ((stats && stats.sumCorrect) || 0) + correct,
    histogram,
  };
}

module.exports = { CHOICES, grade, percentile, summarize, addToStats };
