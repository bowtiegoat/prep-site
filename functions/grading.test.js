const test = require('node:test');
const assert = require('node:assert');
const { grade, percentile, summarize, addToStats, removeFromStats, batchFromScores, applyBatch } = require('./grading');

const key = [
  { q: 1, answer: 'A', code: 'PI:001', indicator: 'Pricing', source: 'LAP' },
  { q: 2, answer: 'B', code: 'PR:002', indicator: 'Promo', source: 'LAP' },
  { q: 3, answer: 'C', code: 'MP:003', indicator: 'Research', source: 'Web' },
];

test('grade counts correct answers and records misses with full data', () => {
  const r = grade(key, ['A', 'C', null]);
  assert.strictEqual(r.correct, 1);
  assert.strictEqual(r.total, 3);
  assert.deepStrictEqual(r.missed.map((m) => [m.q, m.yourAnswer, m.correctAnswer]), [[2, 'C', 'B'], [3, null, 'C']]);
  assert.strictEqual(r.missed[0].indicator, 'Promo');
});

test('grade treats junk answers as blank', () => {
  const r = grade(key, ['a', 'E', 7]);
  assert.deepStrictEqual(r.answers, [null, null, null]);
  assert.strictEqual(r.correct, 0);
});

test('percentile uses mid-rank', () => {
  const hist = [0, 2, 2, 0]; // two people got 1, two got 2
  assert.strictEqual(percentile(hist, 2, 4), 75);
  assert.strictEqual(percentile(hist, 1, 4), 25);
  assert.strictEqual(percentile(hist, 3, 4), 100);
  assert.strictEqual(percentile([], 3, 0), null);
});

test('addToStats and summarize', () => {
  let s = addToStats(null, 2, 3);
  s = addToStats(s, 3, 3);
  assert.deepStrictEqual(s, { total: 3, takers: 2, sumCorrect: 5, histogram: [0, 0, 1, 1] });
  assert.deepStrictEqual(summarize(s, 3), { takers: 2, averageCorrect: 2.5, percentile: 75 });
});

test('removeFromStats undoes addToStats', () => {
  const before = addToStats(null, 2, 3);
  const after = removeFromStats(addToStats(before, 3, 3), 3);
  assert.deepStrictEqual(after, before);
});

test('imported batches add to stats and can be removed exactly', () => {
  const live = addToStats(null, 2, 3);
  const batch = batchFromScores([3, 1, 1], 3);
  assert.deepStrictEqual(batch, { count: 3, sumCorrect: 5, histogram: [0, 2, 0, 1] });
  const merged = applyBatch(live, batch, 1);
  assert.deepStrictEqual(merged, { total: 3, takers: 4, sumCorrect: 7, importedTakers: 3, histogram: [0, 2, 1, 1] });
  assert.strictEqual(summarize(merged, 2).percentile, 63);
  const back = applyBatch(merged, batch, -1);
  assert.deepStrictEqual(back, { ...live, importedTakers: 0 });
});

test('a live submission after an import keeps importedTakers', () => {
  const merged = applyBatch(null, batchFromScores([1], 3), 1);
  const after = addToStats(merged, 2, 3);
  assert.strictEqual(after.importedTakers, 1);
});

const { correctFlags, applyQuestionCounts } = require('./grading');

test('correctFlags marks missed questions 0 and the rest 1', () => {
  assert.deepStrictEqual(correctFlags(4, [{ q: 2 }, { q: 4 }]), [1, 0, 1, 0]);
});

test('per-question counts add and remove cleanly', () => {
  let s = applyQuestionCounts({ takers: 1 }, [1, 0, 1], 1, 1);
  s = applyQuestionCounts(s, [5, 3, 0], 5, 1);
  assert.deepStrictEqual(s.questionCorrect, [6, 3, 1]);
  assert.strictEqual(s.questionTakers, 6);
  assert.strictEqual(s.takers, 1);
  s = applyQuestionCounts(s, [1, 0, 1], 1, -1);
  assert.deepStrictEqual(s.questionCorrect, [5, 3, 0]);
  assert.strictEqual(s.questionTakers, 5);
});

test('applyBatch carries per-question counts when the batch has them', () => {
  const batch = { ...batchFromScores([2, 1], 2), perQuestionCorrect: [2, 1] };
  const added = applyBatch(null, batch, 1);
  assert.deepStrictEqual(added.questionCorrect, [2, 1]);
  assert.strictEqual(added.questionTakers, 2);
  const removed = applyBatch(added, batch, -1);
  assert.deepStrictEqual(removed.questionCorrect, [0, 0]);
  assert.strictEqual(removed.questionTakers, 0);
});
