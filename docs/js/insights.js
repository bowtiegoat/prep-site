// Calculations for the exam deep dive. No Firebase calls, so they can be
// tried outside the browser.
//
// Inputs:
//   questions: Map examId -> examQuestions doc { level, year, label, subtitle, questions: [{ q, code, indicator, source }], answerCounts }
//   stats:     Map examId -> examStats doc (histogram, takers, questionCorrect, questionTakers)
//   attempts:  the student's attempts (each has examId, answers, missed, correct, total, submittedAt)

import { areaOf } from './missed.js';

export const LEVELS = [
  { key: 'Districts', name: 'District', long: 'District/Regional' },
  { key: 'States', name: 'State', long: 'State/Provincial' },
  { key: 'ICDC', name: 'ICDC', long: 'ICDC' },
];
export const MIN_TAKERS = 10;

export const prefixOf = (code) => String(code || '').split(':')[0];
const pct = (right, seen) => (seen ? right / seen : null);

// Exams at a level, newest first.
export function examsAtLevel(questions, level) {
  return [...questions.entries()]
    .filter(([, e]) => e.level === level)
    .sort(([, a], [, b]) => (a.year < b.year ? 1 : -1));
}

// Questions per instructional area at a level. DECA's blueprint is the same
// every year, so the newest exam at that level stands in for it.
export function blueprint(questions, level) {
  const newest = examsAtLevel(questions, level)[0];
  const counts = new Map();
  if (!newest) return counts;
  newest[1].questions.forEach((q) => {
    const p = prefixOf(q.code);
    if (p) counts.set(p, (counts.get(p) || 0) + 1);
  });
  return counts;
}

// One row per question the student answered, right or wrong.
export function questionResults(attempts, questions) {
  return attempts.flatMap((a) => {
    const exam = questions.get(a.examId);
    if (!exam) return [];
    const wrong = new Map((a.missed || []).map((m) => [m.q, m]));
    const date = a.submittedAt?.toDate ? a.submittedAt.toDate() : null;
    return exam.questions.map((q) => ({
      examId: a.examId,
      attemptId: a.id,
      exam: `${exam.label} ${exam.subtitle}`.trim(),
      level: exam.level,
      date,
      q: q.q,
      code: q.code,
      prefix: prefixOf(q.code),
      area: areaOf(q.code),
      indicator: q.indicator,
      source: q.source,
      correct: !wrong.has(q.q),
      yourAnswer: wrong.get(q.q)?.yourAnswer ?? null,
      correctAnswer: wrong.get(q.q)?.correctAnswer ?? null,
    }));
  });
}

// Accuracy by instructional area (prefix -> { right, seen }), plus overall.
export function accuracy(results) {
  const byArea = new Map();
  let right = 0;
  results.forEach((r) => {
    const a = byArea.get(r.prefix) || { right: 0, seen: 0 };
    a.seen += 1;
    if (r.correct) { a.right += 1; right += 1; }
    byArea.set(r.prefix, a);
  });
  return { byArea, overall: pct(right, results.length) };
}

// Expected score on a level's blueprint: each area's questions times the
// student's accuracy there (overall accuracy for areas they haven't seen).
export function projectedScore(bp, acc) {
  if (acc.overall == null || !bp.size) return null;
  let total = 0;
  let points = 0;
  bp.forEach((count, prefix) => {
    const a = acc.byArea.get(prefix);
    points += count * (a ? a.right / a.seen : acc.overall);
    total += count;
  });
  return Math.round((points / total) * 100);
}

// Projected score after each exam, oldest first (for the trend chart).
export function projectionTrend(attempts, questions, level) {
  const bp = blueprint(questions, level);
  const sorted = [...attempts].sort((a, b) => (a.submittedAt?.toMillis() || 0) - (b.submittedAt?.toMillis() || 0));
  return sorted.map((a, i) => {
    const acc = accuracy(questionResults(sorted.slice(0, i + 1), questions));
    const exam = questions.get(a.examId);
    return {
      date: a.submittedAt?.toDate ? a.submittedAt.toDate() : null,
      exam: exam ? `${exam.label} ${exam.subtitle}`.trim() : a.examLabel,
      projected: projectedScore(bp, acc),
    };
  }).filter((p) => p.projected != null);
}

// Points the student is likely losing in each area at this level, most first.
export function pointsAtStake(bp, acc) {
  return [...bp.entries()].map(([prefix, count]) => {
    const a = acc.byArea.get(prefix);
    const rate = a ? a.right / a.seen : acc.overall ?? 0;
    return {
      prefix,
      area: areaOf(`${prefix}:`),
      questions: count,
      seen: a?.seen || 0,
      accuracy: rate,
      estimated: !a,
      lost: count * (1 - rate),
    };
  }).sort((x, y) => y.lost - x.lost || y.questions - x.questions);
}

// The score the top 25% of site test-takers reach on the newest exam at a level.
export function topQuarterScore(questions, stats, level) {
  const newest = examsAtLevel(questions, level)[0];
  const s = newest && stats.get(newest[0]);
  if (!s || (s.takers || 0) < MIN_TAKERS) return null;
  const hist = s.histogram || [];
  const total = s.total || hist.length - 1;
  let below = 0;
  for (let n = 0; n < hist.length; n += 1) {
    below += hist[n] || 0;
    if (below >= s.takers * 0.75) return Math.round((n / total) * 100);
  }
  return null;
}

// PIs that show up on at least half of the exams at a level (and at least twice).
export function mostTestedPis(questions, level) {
  const exams = examsAtLevel(questions, level);
  const seen = new Map();
  exams.forEach(([, e]) => {
    new Set(e.questions.map((q) => q.code).filter(Boolean)).forEach((code) => {
      const indicator = e.questions.find((q) => q.code === code)?.indicator || '';
      const row = seen.get(code) || { code, indicator, exams: 0 };
      row.exams += 1;
      if (!row.indicator) row.indicator = indicator;
      seen.set(code, row);
    });
  });
  const minimum = Math.max(2, Math.ceil(exams.length / 2));
  return {
    examCount: exams.length,
    pis: [...seen.values()].filter((p) => p.exams >= minimum).sort((a, b) => b.exams - a.exams || a.code.localeCompare(b.code)),
  };
}

// How the student has done on each PI: { seen, missed } by code.
export function piRecord(results) {
  const record = new Map();
  results.forEach((r) => {
    if (!r.code) return;
    const p = record.get(r.code) || { seen: 0, missed: 0 };
    p.seen += 1;
    if (!r.correct) p.missed += 1;
    record.set(r.code, p);
  });
  return record;
}

export function piStatus(rec) {
  if (!rec) return 'unseen';
  if (rec.missed === 0) return 'mastered';
  if (rec.missed === rec.seen) return 'missed';
  return 'mixed';
}

// PIs missed on two or more questions.
export function repeatMisses(results) {
  const rec = piRecord(results);
  const info = new Map(results.map((r) => [r.code, r]));
  return [...rec.entries()]
    .filter(([, p]) => p.missed >= 2)
    .map(([code, p]) => ({ code, ...p, indicator: info.get(code)?.indicator || '', area: info.get(code)?.area || '' }))
    .sort((a, b) => b.missed - a.missed || b.missed / b.seen - a.missed / a.seen);
}

// Missed questions grouped by their source, biggest groups first.
export function readingList(results) {
  const groups = new Map();
  results.filter((r) => !r.correct && r.source).forEach((r) => {
    const g = groups.get(r.source) || { source: r.source, missed: 0, codes: new Set(), lap: /^LAP-/i.test(r.source) };
    g.missed += 1;
    if (r.code) g.codes.add(r.code);
    groups.set(r.source, g);
  });
  return [...groups.values()].sort((a, b) => b.missed - a.missed || b.lap - a.lap);
}

// Missed questions that most site test-takers got right (cheapest points).
export function cheapestPoints(results, stats, threshold = 0.7) {
  return results.filter((r) => !r.correct).map((r) => {
    const s = stats.get(r.examId);
    const takers = s?.questionTakers || 0;
    const right = s?.questionCorrect?.[r.q - 1];
    return { ...r, takers, rate: takers >= MIN_TAKERS && right != null ? right / takers : null };
  }).filter((r) => r.rate != null && r.rate >= threshold).sort((a, b) => b.rate - a.rate);
}

// For each level: the student's average and the site's average on exams at that level.
export function levelComparison(attempts, questions, stats) {
  return LEVELS.map((L) => {
    const ids = new Set(examsAtLevel(questions, L.key).map(([id]) => id));
    const mine = attempts.filter((a) => ids.has(a.examId));
    let siteRight = 0;
    let siteSeen = 0;
    ids.forEach((id) => {
      const s = stats.get(id);
      if (s?.takers) { siteRight += s.sumCorrect || 0; siteSeen += s.takers * (s.total || 100); }
    });
    return {
      ...L,
      exams: ids.size,
      taken: mine.length,
      yourAverage: mine.length ? Math.round(mine.reduce((sum, a) => sum + a.correct / a.total, 0) / mine.length * 100) : null,
      siteAverage: siteSeen ? Math.round((siteRight / siteSeen) * 100) : null,
    };
  });
}

// Share of correct answers that are A, B, C, and D across the exams.
export function answerLetters(questions) {
  const totals = { A: 0, B: 0, C: 0, D: 0 };
  questions.forEach((e) => Object.keys(totals).forEach((k) => { totals[k] += e.answerCounts?.[k] || 0; }));
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  return sum ? Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round((v / sum) * 100)])) : null;
}
