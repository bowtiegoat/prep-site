const test = require('node:test');
const assert = require('node:assert');
const { grade, percentile, summarize, addToStats, removeFromStats } = require('./grading');

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
